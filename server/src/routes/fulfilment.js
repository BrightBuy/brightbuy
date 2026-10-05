import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { applyStockChange } from '../services/inventory.js';

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createFulfilmentRoutes(db, requireAuthentication) {
    const router = Router();

    //only admin and warehouse workers can acceses this 
    router.use(requireAuthentication, requireAdmin);


    //post /admin/orders/:id/allocate
    router.post('/admin/orders/:id/allocate', async (req, res) => {
        const orderId = positiveId(req.params.id);
        const { requestKey } = req.body || {};

        if (typeof requestKey !== 'string' || !UUID_REGEX.test(requestKey)) {
            throw new ApiError(
                400,
                'VALIDATION_ERROR',
                'requestKey must be a valid UUID.'
            );
        }

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            const [orders] = await conn.execute(
                `select id, status, stock_state as stockState
                from orders
                where id = ?
                for update`,
                [orderId]
            );

            if (!orders[0]) {
                throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
            }

            const order = orders[0];

            const [existingOps] = await conn.execute(
                `select request_key as requestKey
                from order_operations
                where order_id = ? and kind = 'allocate'`,
                [orderId]
            );

            if (existingOps[0]) {
                if (existingOps[0].requestKey === requestKey) {
                    await conn.commit();

                    return res.status(200).json({
                        data: {
                            id: orderId,
                            status: order.status,
                            replayed: true,
                        },
                    });
                }

                throw new ApiError(
                    409,
                    'IDEMPOTENCY_CONFLICT',
                    'Order has already been allocated with a different requestKey.'
                );
            }


            //only backordered orders can be allocated
            if (order.status !== 'backordered') {
                throw new ApiError(
                    409,
                    'INVALID_STATE',
                    `Cannot allocate order in status '${order.status}'. Only 'backordered' orders can be allocated.`
                );
            }

            const [items] = await conn.execute(
                `select variant_id as variantId, quantity
                    from order_items
                    where order_id = ?
                    order by variant_id asc`,
                [orderId]
            );

            if (items.length === 0) {
                throw new ApiError(400, 'INVALID_ORDER', 'Order has no items.');
            }

            const variantIds = items.map((item) => item.variantId);
            const placeholders = variantIds.map(() => '?').join(',');

            const [variants] = await conn.query(
                `select id, stock
                from variants
                where id in (${placeholders})
                order by id asc
                for update`,
                variantIds
            );

            const variantStockMap = new Map(
                variants.map((variant) => [variant.id, variant.stock])
            );

            for (const item of items) {
                const availableStock =
                    variantStockMap.get(item.variantId) ?? 0;

                if (availableStock < item.quantity) {
                    throw new ApiError(
                        409,
                        'INSUFFICIENT_STOCK',
                        `Variant #${item.variantId} has insufficient stock (available: ${availableStock}, required: ${item.quantity}).`
                    );
                }
            }

            for (const item of items) {
                await applyStockChange(conn, {
                    variantId: item.variantId,
                    quantityDelta: -item.quantity,
                    movementType: 'allocation',
                    orderId,
                    adminId: req.user.id,
                    referenceKey: `allocate:${orderId}:${item.variantId}`,
                    reason: `Backorder allocation for order #${orderId}`,
                });
            }

            await conn.execute(
                `update orders
                set status = 'confirmed',
                stock_state = 'allocated'
                where id = ?`,
                [orderId]
            );

            await conn.execute(
                `insert into order_status_history
                (order_id, from_status, to_status, actor_id)
                values (?, 'backordered', 'confirmed', ?)`,
                [orderId, req.user.id]
            );

            await conn.execute(
                `insert into order_operations
                (order_id, kind, request_key, actor_id, fingerprint)
                values (?, 'allocate', ?, ?, 'allocation')`,
                [orderId, requestKey, req.user.id]
            );

            await conn.commit();

            res.status(200).json({
                data: {
                    id: orderId,
                    status: 'confirmed',
                    stockState: 'allocated',
                },
            });
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    });



    // patch /admin/orders/:id/status
    router.patch('/admin/orders/:id/status', async (req, res) => {
        const orderId = positiveId(req.params.id);
        const { status: targetStatus } = req.body || {};

        if (typeof targetStatus !== 'string') {
            throw new ApiError(
                400,
                'VALIDATION_ERROR',
                'Target status string is required.'
            );
        }

        // use the specific endpoints 
        if (targetStatus === 'cancelled') {
            throw new ApiError(
                403,
                'FORBIDDEN_TRANSITION',
                'Cancellations must use the dedicated cancellation endpoint.'
            );
        }

        if (['delivered', 'collected'].includes(targetStatus)) {
            throw new ApiError(
                403,
                'FORBIDDEN_TRANSITION',
                'Order completion must use the dedicated /complete endpoint.'
            );
        }

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            // get and lock the order
            const [orders] = await conn.execute(
                `select id, status, fulfillment, stock_state as stockState
                from orders
                where id = ?
                for update`,
                [orderId]
            );

            if (!orders[0]) {
                throw new ApiError(
                    404,
                    'NOT_FOUND',
                    'Order not found.'
                );
            }

            const order = orders[0];

            // check the allowed next status
            const allowedTransitions = {
                confirmed: ['processing'],
                processing:
                    order.fulfillment === 'delivery'
                        ? ['shipped']
                        : ['ready_for_pickup'],
            };

            const nextAllowed = allowedTransitions[order.status] || [];

            if (!nextAllowed.includes(targetStatus)) {
                throw new ApiError(
                    409,
                    'INVALID_STATUS_TRANSITION',
                    `Cannot transition order from '${order.status}' to '${targetStatus}'.`,
                    [{ allowed: nextAllowed }]
                );
            }

            // stock must be allocated before processing
            if (
                order.status === 'confirmed' &&
                targetStatus === 'processing'
            ) {
                if (
                    order.stockState &&
                    order.stockState !== 'allocated'
                ) {
                    throw new ApiError(
                        409,
                        'STOCK_NOT_ALLOCATED',
                        'Stock must be allocated before processing.'
                    );
                }
            }

            // update the order status
            await conn.execute(
                `update orders
                set status = ?
                where id = ?`,
                [targetStatus, orderId]
            );

            // save the status change
            await conn.execute(
                `insert into order_status_history
                (order_id, from_status, to_status, actor_id)
                values (?, ?, ?, ?)`,
                [orderId, order.status, targetStatus, req.user.id]
            );

            await conn.commit();

            res.json({
                data: {
                    id: orderId,
                    status: targetStatus,
                    fulfillment: order.fulfillment,
                },
            });
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    });






    // post /admin/orders/:id/complete
    router.post('/admin/orders/:id/complete', async (req, res) => {
        const orderId = positiveId(req.params.id);
        const { requestKey, cashReceived } = req.body || {};

        if (typeof requestKey !== 'string' || !UUID_REGEX.test(requestKey)) {
            throw new ApiError(
                400,
                'VALIDATION_ERROR',
                'requestKey must be a valid UUID.'
            );
        }

        if (typeof cashReceived !== 'boolean') {
            throw new ApiError(
                400,
                'VALIDATION_ERROR',
                'cashReceived must be a boolean.'
            );
        }

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            // get and lock the order
            const [orders] = await conn.execute(
                `select id, status, fulfillment, stock_state as stockState
                from orders
                where id = ?
                for update`,
                [orderId]
            );

            if (!orders[0]) {
                throw new ApiError(
                    404,
                    'NOT_FOUND',
                    'Order not found.'
                );
            }

            const order = orders[0];

            // check if the order was already completed
            const [existingOps] = await conn.execute(
                `select request_key as requestKey, fingerprint
                from order_operations
                where order_id = ? and kind = 'complete'`,
                [orderId]
            );

            if (existingOps[0]) {
                if (existingOps[0].requestKey === requestKey) {
                    await conn.commit();

                    return res.status(200).json({
                        data: {
                            id: orderId,
                            status: order.status,
                            replayed: true,
                        },
                    });
                }

                throw new ApiError(
                    409,
                    'IDEMPOTENCY_CONFLICT',
                    'Order has already been completed with a different requestKey.'
                );
            }

            // check the status before completing
            const isDelivery = order.fulfillment === 'delivery';

            if (isDelivery && order.status !== 'shipped') {
                throw new ApiError(
                    409,
                    'INVALID_STATE',
                    "Delivery orders must be 'shipped' before they can be completed."
                );
            }

            if (!isDelivery && order.status !== 'ready_for_pickup') {
                throw new ApiError(
                    409,
                    'INVALID_STATE',
                    "Pickup orders must be 'ready_for_pickup' before they can be completed."
                );
            }

            // check the payment
            const [payments] = await conn.execute(
                `select id, method, status
                from payments
                where order_id = ?
                for update`,
                [orderId]
            );

            if (payments[0]) {
                const payment = payments[0];

                if (payment.method === 'cod') {
                    if (!cashReceived) {
                        throw new ApiError(
                            409,
                            'CASH_NOT_RECEIVED',
                            'Cash must be collected before completing a COD order.'
                        );
                    }

                    // mark cash payment as paid
                    await conn.execute(
                        `update payments
                        set status = 'paid',
                            paid_at = current_timestamp,
                            collection_request_key = ?,
                            collected_by = ?
                        where id = ?`,
                        [requestKey, req.user.id, payment.id]
                    );
                } else if (payment.method === 'card') {
                    if (cashReceived) {
                        throw new ApiError(
                            409,
                            'PAYMENT_STATE_CONFLICT',
                            'Card orders cannot accept cash collection.'
                        );
                    }

                    if (payment.status !== 'paid') {
                        throw new ApiError(
                            409,
                            'PAYMENT_STATE_CONFLICT',
                            'Card payment is not paid.'
                        );
                    }
                }
            }

            // set the final order status
            const targetStatus = isDelivery
                ? 'delivered'
                : 'collected';

            await conn.execute(
                `update orders
                set status = ?,
                    stock_state = 'consumed'
                where id = ?`,
                [targetStatus, orderId]
            );

            // update delivery date if the table is available
            await conn.execute(
                `update deliveries
                set actual_date = current_date
                where order_id = ?`,
                [orderId]
            ).catch(() => { });

            // save the status change
            await conn.execute(
                `insert into order_status_history
                (order_id, from_status, to_status, actor_id)
                values (?, ?, ?, ?)`,
                [orderId, order.status, targetStatus, req.user.id]
            );

            // save the completion request
            const fingerprint = `${targetStatus}:${cashReceived ? 'cash' : 'card'}`;

            await conn.execute(
                `insert into order_operations
                (order_id, kind, request_key, actor_id, fingerprint)
                values (?, 'complete', ?, ?, ?)`,
                [orderId, requestKey, req.user.id, fingerprint]
            );

            await conn.commit();

            res.status(200).json({
                data: {
                    id: orderId,
                    status: targetStatus,
                    stockState: 'consumed',
                },
            });
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    });

    return router;
}


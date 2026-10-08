import { ApiError } from "../errors.js";

//inventory movements format

function formatMovement(row) {
    return {
        id: row.id,
        variantId: row.variant_id,
        orderId: row.order_id,
        adminId: row.admin_id,
        changeQty: row.change_qty,
        stockAfter: row.stock_after,
        movementType: row.movement_type,
        reason: row.reason,
        referenceKey: row.reference_key,
        createdAt: row.created_at,
    };
}

export async function applyStockChange(connection, {
    variantId,
    quantityDelta,
    movementType,
    orderId = null,
    adminId = null,
    referenceKey,
    reason,
}) {


    //validate varientID

    if (!Number.isInteger(variantId) || variantId <= 0) {
        throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'variantID must be a valid number'
        );
    }

    //validate quantityDelta

    if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
        throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'quantityDelta must be a non-zero integer.'
        );
    }

    //validate movementType
    const validMovementTypes = [
        'sale',
        'adjustment',
        'allocation',
        'cancellation',
    ];

    if (!validMovementTypes.includes(movementType)) {
        throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'Invalid movementType.'
        );
    }

    //validate referenceKey
    if (!referenceKey || typeof referenceKey !== 'string') {
        throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'referenceKey is required.'
        );
    }

    //validate reason
    if (!reason || typeof reason !== 'string') {
        throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'reason is required.'
        );
    }

    try {

        const [resultSets] = await connection.query(
            `CALL sp_apply_stock_change(?, ?, ?, ?, ?, ?, ?)`,
            [
                variantId,
                quantityDelta,
                movementType,
                orderId,
                adminId,
                referenceKey,
                reason,
            ]
        );

        const rows = resultSets && resultSets[0];

        if (!rows || rows.length === 0) {
            throw new ApiError(
                500,
                'INTERNAL_ERROR',
                'No movement record returned from procedure.'
            );
        }

        return formatMovement(rows[0]);



    } catch (error) {

        //check error is api error or not
        if (error instanceof ApiError) {
            throw error;
        }

        const msg = error.message || '';


        //store the errror
        if (msg.includes('INSUFFICIENT_STOCK')) {
            throw new ApiError(
                409,
                'INSUFFICIENT_STOCK',
                'Insufficient stock for this change.'
            );
        }

        if (msg.includes('IDEMPOTENCY_CONFLICT')) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was used for a different stock adjustment.');
        if (msg.includes('STOCK_OVERFLOW')) throw new ApiError(409, 'STOCK_OVERFLOW', 'Stock exceeds the supported maximum.');
        if (msg.includes('VARIANT_NOT_FOUND')) throw new ApiError(404, 'NOT_FOUND', 'Variant not found.');
        if (msg.includes('INVALID_DELTA')) {
            throw new ApiError(
                400,
                'INVALID_DELTA',
                'Quantity change cannot be zero.'
            );
        }

        if (
            msg.includes('Duplicate entry') &&
            msg.includes('reference_key')
        ) {
            throw new ApiError(
                409,
                'IDEMPOTENCY_CONFLICT',
                'Reference key conflict.'
            );
        }

        //throw error for unknown error
        throw error;

    }
}
import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { applyStockChange } from '../services/inventory.js';

//regex for uuid
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createInventoryRoutes(db, requireAuthentication) {
    const router = Router();

    //check only admin is logging to the page
    router.use(['/admin/inventory', '/admin/variants'], requireAuthentication, requireAdmin);

    //view currunt inventory+
    router.get('/admin/inventory', async (req, res) => {
        const lowStockOnly = req.query.lowStockOnly === 'true';
        let threshold = 5;

        if (req.query.threshold !== undefined) {
            const parsed = Number(req.query.threshold);
            if (!Number.isInteger(parsed) || parsed < 0) {
                throw new ApiError(400, 'VALIDATION_ERROR', 'Threshold must be a non-negative integer.');
            }
            threshold = parsed;
        }


        let sql = `
            select 
                v.id,
                v.product_id as productId,
                p.name as productTitle,
                v.sku,
                v.name as title,
                v.stock,
                p.is_active as active
            from variants v
            join products p on v.product_id = p.id`;

        const params = [];

        if (lowStockOnly) {
            sql += ` where v.stock <= ?`;
            params.push(threshold);
        }

        sql += ` order by v.id asc`;

        const [rows] = await db.query(sql, params);
        res.json({ data: rows });
    });



    // change the stock and movement
    router.post('/admin/variants/:id/stock-adjustments', async (req, res) => {
        const variantId = positiveId(req.params.id);
        const { quantityDelta, reason, requestKey } = req.body || {};

        //validate inputs
        if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'quantityDelta must be a non-zero integer.');
        }
        if (Math.abs(quantityDelta) > 1000000) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'quantityDelta magnitude cannot exceed 1,000,000.');
        }
        if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 200) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'reason must be between 1 and 200 characters.');
        }
        if (typeof requestKey !== 'string' || !UUID_REGEX.test(requestKey)) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'requestKey must be a valid UUID.');
        }

        //verify variant exists
        const [variants] = await db.execute('select id from variants where id = ?', [variantId]);
        if (!variants[0]) {
            throw new ApiError(404, 'NOT_FOUND', 'Variant not found.');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const movement = await applyStockChange(conn, {
                variantId,
                quantityDelta,
                movementType: 'adjustment',
                adminId: req.user.id,
                orderId: null,
                referenceKey: `adjust:${requestKey}`,
                reason: reason.trim(),
            });

            await conn.commit();
            res.status(201).json({ data: movement });
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    });




    //view stock history
    router.get('/admin/variants/:id/stock-movements', async (req, res) => {
        const variantId = positiveId(req.params.id);

        //verify variant exists
        const [variants] = await db.execute('select id from variants where id = ?', [variantId]);
        if (!variants[0]) {
            throw new ApiError(404, 'NOT_FOUND', 'Variant not found.');
        }

        const [rows] = await db.execute(
            `select 
                id,
                variant_id as variantId,
                order_id as orderId,
                admin_id as adminId,
                change_qty as changeQty,
                stock_after as stockAfter,
                movement_type as movementType,
                reason,
                reference_key as referenceKey,
                created_at as createdAt
            from inventory_movements
            where variant_id = ?
            order by created_at desc, id desc`,
            [variantId]
        );

        res.json({ data: rows });
    });

    return router;
}



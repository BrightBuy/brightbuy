import { Router } from 'express';
import { ApiError, positiveId } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { nextStatuses } from '@brightbuy/contracts';
import { inTransaction } from '../utils/transaction.js';
import { presentOrder as presentOrderDetail } from '../services/order-presenter.js';

const ORDER_SELECT=`SELECT o.id,o.customer_id AS customerId,o.status,o.fulfillment,
  o.address_snapshot AS addressSnapshot,o.currency,o.total,o.created_at AS createdAt,
  o.stock_state AS stockState,o.was_out_of_stock AS wasOutOfStock,
  EXISTS(SELECT 1 FROM checkout_requests cr WHERE cr.order_id=o.id) AS hasCheckout
  FROM orders o`;
function presentOrderSummary(row) {
  const {hasCheckout,...order}=row;
  const isLegacy=!hasCheckout && order.stockState==null && order.wasOutOfStock==null;
  if(!isLegacy && (!hasCheckout || order.stockState==null || order.wasOutOfStock==null)) {
    throw new ApiError(409,'ORDER_DATA_INCOMPLETE','Order records need review.');
  }
  return {...order,isLegacy,createdAt:new Date(order.createdAt).toISOString(),
    addressSnapshot:typeof order.addressSnapshot==='string'?JSON.parse(order.addressSnapshot):order.addressSnapshot,
    stockState:isLegacy?null:order.stockState,wasOutOfStock:isLegacy?null:Boolean(order.wasOutOfStock),
    nextStatuses:isLegacy?[]:nextStatuses(order.status,order.fulfillment)};
}
export function createOrderRoutes(db, requireAuthentication) {
  const router=Router();
  router.get('/orders',requireAuthentication,async(req,res)=>{
    const data=await inTransaction(db,async(connection)=>{
      const [rows]=await connection.execute(`${ORDER_SELECT} WHERE o.customer_id=? ORDER BY o.id`,[req.user.id]);
      return rows.map(presentOrderSummary);
    });
    res.json({data});
  });
  router.get('/admin/orders',requireAuthentication,requireAdmin,async(req,res)=>{
    const data=await inTransaction(db,async(connection)=>{
      const [rows]=await connection.query(`${ORDER_SELECT} ORDER BY o.id`);
      return rows.map(presentOrderSummary);
    });
    res.json({data});
  });
  router.get('/orders/:id',requireAuthentication,async(req,res)=>{
    const id=positiveId(req.params.id);
    const data=await inTransaction(db,async(connection)=>{
      const [owned]=await connection.execute(
        "SELECT id FROM orders WHERE id=? AND (customer_id=? OR ?='admin')",[id,req.user.id,req.user.role]);
      if(!owned.length)throw new ApiError(404,'NOT_FOUND','Resource not found.');
      return presentOrderDetail(connection,id);
    });
    res.json({data});
  });
  // Coordinate this ordinary-forward-transition handler with M4; retain ONE handler.
  router.patch('/admin/orders/:id/status',requireAuthentication,requireAdmin,async(req,res)=>{
    const id=positiveId(req.params.id);const body=req.body;
    if(!body || Array.isArray(body) || Object.keys(body).length!==1 || typeof body.status!=='string') {
      throw new ApiError(400,'VALIDATION_ERROR','Provide only a status string.');
    }
    const data=await inTransaction(db,async(connection)=>{
      const [rows]=await connection.execute('SELECT id FROM orders WHERE id=? FOR UPDATE',[id]);
      if(!rows.length)throw new ApiError(404,'NOT_FOUND','Resource not found.');
      const order=await presentOrderDetail(connection,id);
      if(order.isLegacy)throw new ApiError(409,'LEGACY_ORDER_REQUIRES_MIGRATION','Legacy order is read-only.');
      if(['confirmed','cancelled','delivered','collected'].includes(body.status)) {
        throw new ApiError(409,'DEDICATED_ACTION_REQUIRED','Use allocation, cancellation or completion.');
      }
      const target=order.status==='confirmed'?'processing':order.status==='processing'
        ?order.fulfillment==='delivery'?'shipped':'ready_for_pickup':null;
      if(body.status!==target || order.stockState!=='allocated') {
        throw new ApiError(409,'INVALID_STATUS_TRANSITION','This order cannot move to that status.');
      }
      await connection.execute('UPDATE orders SET status=? WHERE id=?',[target,id]);
      await connection.execute(`INSERT INTO order_status_history(order_id,from_status,to_status,actor_id)
        VALUES(?,?,?,?)`,[id,order.status,target,req.user.id]);
      return presentOrderDetail(connection,id);
    });
    res.json({data});
  });
  return router;
}

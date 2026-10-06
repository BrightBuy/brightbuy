import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { applyStockChange } from '../src/services/inventory.js';

const secret = 'inventory-fulfilment-test-secret-at-least-32-chars';
const users = [
    { id: 1, name: 'Admin User', email: 'admin@brightbuy.test', role: 'admin' },
    { id: 2, name: 'Customer User', email: 'customer@brightbuy.test', role: 'customer' },
];

const token = (id) =>
    jwt.sign({}, secret, {
        subject: String(id),
        issuer: 'brightbuy',
        audience: 'brightbuy-web',
        expiresIn: '1h',
    });

async function serve(db, work) {
    const server = createApp(db, secret).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const request = async (path, { user, method = 'GET', body } = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(user ? { Authorization: `Bearer ${token(user)}` } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json() };
    };
    try {
        await work(request);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('applyStockChange validates inputs before database access', async () => {
    const dummyConn = {};
    await assert.rejects(
        () =>
            applyStockChange(dummyConn, {
                variantId: 0,
                quantityDelta: 5,
                movementType: 'adjustment',
                referenceKey: 'ref1',
                reason: 'restock',
            }),
        { message: 'variantID must be a valid number' },
    );
    await assert.rejects(
        () =>
            applyStockChange(dummyConn, {
                variantId: 1,
                quantityDelta: 0,
                movementType: 'adjustment',
                referenceKey: 'ref1',
                reason: 'restock',
            }),
        { message: 'quantityDelta must be a non-zero integer.' },
    );
    await assert.rejects(
        () =>
            applyStockChange(dummyConn, {
                variantId: 1,
                quantityDelta: 5,
                movementType: 'invalid_type',
                referenceKey: 'ref1',
                reason: 'restock',
            }),
        { message: 'Invalid movementType.' },
    );
});

test('inventory and fulfilment admin routes require authentication and admin role', async () => {
    const db = {
        async execute(sql, [id]) {
            return [users.filter((u) => String(u.id) === String(id))];
        },
        async query() {
            return [[]];
        },
    };
    await serve(db, async (request) => {
        const routes = [
            ['/admin/inventory', 'GET'],
            ['/admin/variants/1/stock-adjustments', 'POST', {}],
            ['/admin/orders/1/allocate', 'POST', {}],
            ['/admin/orders/1/status', 'PATCH', {}],
            ['/admin/orders/1/complete', 'POST', {}],
        ];

        for (const [path, method, body] of routes) {
            const unauth = await request(path, { method, body });
            assert.equal(unauth.status, 401);

            const customer = await request(path, { user: 2, method, body });
            assert.equal(customer.status, 403);
        }
    });
});

test('inventory adjustment and list validate parameters', async () => {
    const db = {
        async execute(sql, [id]) {
            return [users.filter((u) => String(u.id) === String(id))];
        },
        async query() {
            return [[]];
        },
    };
    await serve(db, async (request) => {
        const badThreshold = await request('/admin/inventory?threshold=-1', { user: 1 });
        assert.equal(badThreshold.status, 400);

        const badDelta = await request('/admin/variants/1/stock-adjustments', {
            user: 1,
            method: 'POST',
            body: { quantityDelta: 0, reason: 'Test', requestKey: crypto.randomUUID() },
        });
        assert.equal(badDelta.status, 400);
    });
});

test('backorder allocation validates requests and prevents invalid allocation', async () => {
    const testOrder = { id: 1, status: 'confirmed', stockState: 'allocated', fulfillment: 'delivery' };
    const db = {
        async execute(sql, [id]) {
            return [users.filter((u) => String(u.id) === String(id))];
        },
        async query() {
            return [[]];
        },
        async getConnection() {
            return {
                async beginTransaction() { },
                async commit() { },
                async rollback() { },
                release() { },
                async query() {
                    return [[]];
                },
                async execute(sql) {
                    if (/from orders/i.test(sql)) return [[testOrder]];
                    if (/from order_operations/i.test(sql)) return [[]];
                    return [[]];
                },
            };
        },
    };

    await serve(db, async (request) => {
        const badKey = await request('/admin/orders/1/allocate', {
            user: 1,
            method: 'POST',
            body: { requestKey: 'invalid-uuid' },
        });
        assert.equal(badKey.status, 400);

        const notBackordered = await request('/admin/orders/1/allocate', {
            user: 1,
            method: 'POST',
            body: { requestKey: crypto.randomUUID() },
        });
        assert.equal(notBackordered.status, 409);
        assert.equal(notBackordered.body.error.code, 'INVALID_STATE');
    });
});

test('order complete requires terminal fulfillment state and valid COD collection', async () => {
    let orderState = { id: 1, status: 'processing', fulfillment: 'delivery', stockState: 'allocated' };
    const db = {
        async execute(sql, [id]) {
            return [users.filter((u) => String(u.id) === String(id))];
        },
        async query() {
            return [[]];
        },
        async getConnection() {
            return {
                async beginTransaction() { },
                async commit() { },
                async rollback() { },
                release() { },
                async query() {
                    return [[]];
                },
                async execute(sql) {
                    if (/from orders/i.test(sql)) return [[orderState]];
                    if (/from order_operations/i.test(sql)) return [[]];
                    if (/from payments/i.test(sql)) return [[{ method: 'cod', status: 'pending' }]];
                    return [[]];
                },
            };
        },
    };

    await serve(db, async (request) => {
        const missingCash = await request('/admin/orders/1/complete', {
            user: 1,
            method: 'POST',
            body: { requestKey: crypto.randomUUID() },
        });
        assert.equal(missingCash.status, 400);

        const notShipped = await request('/admin/orders/1/complete', {
            user: 1,
            method: 'POST',
            body: { requestKey: crypto.randomUUID(), cashReceived: true },
        });
        assert.equal(notShipped.status, 409);

        orderState.status = 'shipped';
        const codNoCash = await request('/admin/orders/1/complete', {
            user: 1,
            method: 'POST',
            body: { requestKey: crypto.randomUUID(), cashReceived: false },
        });
        assert.equal(codNoCash.status, 409);
        assert.equal(codNoCash.body.error.code, 'CASH_NOT_RECEIVED');
    });
});

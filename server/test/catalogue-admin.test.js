import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const secret = 'test-only-secret-that-is-at-least-32-characters';
let server, base;

const users = [
  { id: 1, name: 'Customer', email: 'customer@example.test', role: 'customer' },
  { id: 2, name: 'Admin', email: 'admin@example.test', role: 'admin' },
];

let categories = [];
let attributes = [];
let nextCategoryId = 2;
let nextAttributeId = 2;

const db = {
  async query(sql) {
    if (sql.includes('FROM categories')) {
      return [[...categories].sort((a, b) => a.name.localeCompare(b.name))];
    }
    if (sql.includes('FROM attributes')) {
      return [[...attributes].sort((a, b) => a.name.localeCompare(b.name))];
    }
    return [[]];
  },
  async execute(sql, params) {
    // Auth lookup
    if (sql.includes('customers WHERE id')) {
      const user = users.find((u) => String(u.id) === String(params[0]));
      return [user ? [user] : []];
    }

    // Categories
    if (sql.includes('SELECT id FROM categories WHERE name = ? AND id != ?')) {
      const [name, id] = params;
      const found = categories.find(
        (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== Number(id),
      );
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id FROM categories WHERE name = ?')) {
      const [name] = params;
      const found = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id, name, description FROM categories WHERE id = ?')) {
      const [id] = params;
      const found = categories.find((c) => c.id === Number(id));
      return [found ? [found] : []];
    }
    if (sql.includes('INSERT INTO categories')) {
      const [name, description] = params;
      const id = nextCategoryId++;
      const item = { id, name, description };
      categories.push(item);
      return [{ insertId: id }];
    }
    if (sql.includes('UPDATE categories SET')) {
      const [name, description, id] = params;
      const found = categories.find((c) => c.id === Number(id));
      if (found) {
        found.name = name;
        found.description = description;
      }
      return [{ affectedRows: found ? 1 : 0 }];
    }

    // Attributes
    if (sql.includes('SELECT id FROM attributes WHERE name = ? AND id != ?')) {
      const [name, id] = params;
      const found = attributes.find(
        (a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== Number(id),
      );
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id FROM attributes WHERE name = ?')) {
      const [name] = params;
      const found = attributes.find((a) => a.name.toLowerCase() === name.toLowerCase());
      return [found ? [{ id: found.id }] : []];
    }
    if (sql.includes('SELECT id, name FROM attributes WHERE id = ?')) {
      const [id] = params;
      const found = attributes.find((a) => a.id === Number(id));
      return [found ? [found] : []];
    }
    if (sql.includes('INSERT INTO attributes')) {
      const [name] = params;
      const id = nextAttributeId++;
      const item = { id, name };
      attributes.push(item);
      return [{ insertId: id }];
    }
    if (sql.includes('UPDATE attributes SET')) {
      const [name, id] = params;
      const found = attributes.find((a) => a.id === Number(id));
      if (found) {
        found.name = name;
      }
      return [{ affectedRows: found ? 1 : 0 }];
    }

    throw new Error(`Unexpected SQL execution in catalogue-admin test: ${sql}`);
  },
};

const token = (id = 1, opts = {}) =>
  jwt.sign({ role: users.find((u) => u.id === id)?.role || 'customer' }, secret, {
    subject: String(id),
    issuer: 'brightbuy',
    audience: 'brightbuy-web',
    expiresIn: '1h',
    ...opts,
  });

async function request(path, { id, authorization, ...options } = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(id ? { Authorization: `Bearer ${token(id)}` } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
    },
  });
  return {
    status: response.status,
    body: await response.json(),
    requestId: response.headers.get('x-request-id'),
  };
}

before(async () => {
  server = createApp(db, secret).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  categories = [{ id: 1, name: 'Everyday Essentials', description: 'Legacy collection' }];
  attributes = [{ id: 1, name: 'Color' }];
  nextCategoryId = 2;
  nextAttributeId = 2;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

// -----------------------------------------------------------------------------
// Public Endpoints
// -----------------------------------------------------------------------------

test('public GET /api/categories returns array of categories', async () => {
  const res = await request('/api/categories');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, 'Everyday Essentials');
});

test('public GET /api/attributes returns array of attributes', async () => {
  const res = await request('/api/attributes');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, 'Color');
});

// -----------------------------------------------------------------------------
// Authentication and Authorization Guards
// -----------------------------------------------------------------------------

test('anonymous users cannot mutate categories or attributes (401)', async () => {
  const catPost = await request('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Audio' }),
  });
  assert.equal(catPost.status, 401);
  assert.equal(catPost.body.error.code, 'UNAUTHENTICATED');

  const attrPost = await request('/api/admin/attributes', {
    method: 'POST',
    body: JSON.stringify({ name: 'Storage' }),
  });
  assert.equal(attrPost.status, 401);
  assert.equal(attrPost.body.error.code, 'UNAUTHENTICATED');
});

test('customers cannot mutate categories or attributes (403)', async () => {
  const catPost = await request('/api/admin/categories', {
    id: 1, // customer
    method: 'POST',
    body: JSON.stringify({ name: 'Audio' }),
  });
  assert.equal(catPost.status, 403);
  assert.equal(catPost.body.error.code, 'FORBIDDEN');

  const catPatch = await request('/api/admin/categories/1', {
    id: 1,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Updated Essentials' }),
  });
  assert.equal(catPatch.status, 403);
  assert.equal(catPatch.body.error.code, 'FORBIDDEN');

  const attrPost = await request('/api/admin/attributes', {
    id: 1,
    method: 'POST',
    body: JSON.stringify({ name: 'Storage' }),
  });
  assert.equal(attrPost.status, 403);
  assert.equal(attrPost.body.error.code, 'FORBIDDEN');

  const attrPatch = await request('/api/admin/attributes/1', {
    id: 1,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Material' }),
  });
  assert.equal(attrPatch.status, 403);
  assert.equal(attrPatch.body.error.code, 'FORBIDDEN');
});

// -----------------------------------------------------------------------------
// Category Management (Admin id = 2)
// -----------------------------------------------------------------------------

test('admin can create a category (201)', async () => {
  const res = await request('/api/admin/categories', {
    id: 2, // admin
    method: 'POST',
    body: JSON.stringify({ name: 'Headphones', description: 'Over-ear and in-ear audio' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.id, 2);
  assert.equal(res.body.data.name, 'Headphones');
  assert.equal(res.body.data.description, 'Over-ear and in-ear audio');
});

test('category creation rejects invalid payloads and unknown keys (400)', async () => {
  // Missing / empty name
  const emptyName = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: '   ' }),
  });
  assert.equal(emptyName.status, 400);
  assert.equal(emptyName.body.error.code, 'VALIDATION_ERROR');

  // Name exceeding 100 chars
  const longName = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'A'.repeat(101) }),
  });
  assert.equal(longName.status, 400);

  // Description exceeding 500 chars
  const longDesc = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Valid', description: 'D'.repeat(501) }),
  });
  assert.equal(longDesc.status, 400);

  // Unknown property
  const unknownKey = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Valid', stock: 10 }),
  });
  assert.equal(unknownKey.status, 400);
  assert.equal(unknownKey.body.error.code, 'VALIDATION_ERROR');
});

test('category creation rejects duplicate names (409)', async () => {
  const duplicate = await request('/api/admin/categories', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Everyday Essentials' }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CATEGORY_NAME_EXISTS');
});

test('admin can update a category (200) and handles 404/409', async () => {
  // Update name and description
  const updated = await request('/api/admin/categories/1', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Updated Essentials', description: 'Updated desc' }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, 'Updated Essentials');
  assert.equal(updated.body.data.description, 'Updated desc');

  // Not found
  const notFound = await request('/api/admin/categories/999', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'New Name' }),
  });
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error.code, 'NOT_FOUND');

  // Invalid ID format
  const badId = await request('/api/admin/categories/invalid', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'New Name' }),
  });
  assert.equal(badId.status, 400);
  assert.equal(badId.body.error.code, 'VALIDATION_ERROR');
});

// -----------------------------------------------------------------------------
// Attribute Management (Admin id = 2)
// -----------------------------------------------------------------------------

test('admin can create an attribute (201)', async () => {
  const res = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Storage' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.id, 2);
  assert.equal(res.body.data.name, 'Storage');
});

test('attribute creation rejects empty names, long names, and unknown keys (400)', async () => {
  const emptyName = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: '' }),
  });
  assert.equal(emptyName.status, 400);

  const longName = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'A'.repeat(51) }),
  });
  assert.equal(longName.status, 400);

  const unknown = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Valid', extra: true }),
  });
  assert.equal(unknown.status, 400);
});

test('attribute creation and rename reject duplicate names (409)', async () => {
  // Duplicate create
  const dupCreate = await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Color' }),
  });
  assert.equal(dupCreate.status, 409);
  assert.equal(dupCreate.body.error.code, 'ATTRIBUTE_NAME_EXISTS');

  // Create second attribute
  await request('/api/admin/attributes', {
    id: 2,
    method: 'POST',
    body: JSON.stringify({ name: 'Size' }),
  });

  // Attempt rename of id:2 to 'Color'
  const dupRename = await request('/api/admin/attributes/2', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Color' }),
  });
  assert.equal(dupRename.status, 409);
  assert.equal(dupRename.body.error.code, 'ATTRIBUTE_NAME_EXISTS');
});

test('admin can update attribute (200) and handles 404', async () => {
  const updated = await request('/api/admin/attributes/1', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Colour' }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, 'Colour');

  const notFound = await request('/api/admin/attributes/999', {
    id: 2,
    method: 'PATCH',
    body: JSON.stringify({ name: 'Size' }),
  });
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error.code, 'NOT_FOUND');
});

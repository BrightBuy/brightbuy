import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoney,
  formatMoneyUnits,
  multiplyMoney,
  addMoney,
  MAX_MONEY_UNITS,
  MAX_MONEY_STRING,
} from '../src/utils/money.js';
import { ApiError } from '../src/errors.js';

test('parseMoney accepts valid two-decimal strings and converts to BigInt minor units', () => {
  assert.equal(parseMoney('0.00'), 0n);
  assert.equal(parseMoney('0.01'), 1n);
  assert.equal(parseMoney('0.99'), 99n);
  assert.equal(parseMoney('1.00'), 100n);
  assert.equal(parseMoney('40.00'), 4000n);
  assert.equal(parseMoney('12345.67'), 1234567n);
  assert.equal(parseMoney(MAX_MONEY_STRING), MAX_MONEY_UNITS);
});

test('parseMoney rejects non-string types and silent number coercion', () => {
  const invalidTypes = [40, 40.0, 0, null, undefined, true, false, {}, [], 40n];
  for (const input of invalidTypes) {
    assert.throws(
      () => parseMoney(input),
      (err) => err instanceof ApiError && err.code === 'INVALID_PRICE' && err.status === 400,
      `Expected parseMoney(${typeof input}) to throw INVALID_PRICE`,
    );
  }
});

test('parseMoney rejects negative, exponent, commas, fractional-cent and malformed values', () => {
  const malformedInputs = [
    '-40.00',
    '-0.01',
    '40',
    '40.',
    '40.0',
    '40.000',
    '40.001',
    '1,000.00',
    '1e2.00',
    '1e2',
    '01.00',
    '00.50',
    'Infinity',
    '-Infinity',
    'NaN',
    '',
    '   ',
    '40.00 USD',
    '$40.00',
  ];

  for (const input of malformedInputs) {
    assert.throws(
      () => parseMoney(input),
      (err) => err instanceof ApiError && err.code === 'INVALID_PRICE' && err.status === 400,
      `Expected parseMoney("${input}") to throw INVALID_PRICE`,
    );
  }
});

test('parseMoney enforces max limits at the caller boundary', () => {
  const customLimit = 5000n; // $50.00
  assert.equal(parseMoney('50.00', { max: customLimit }), 5000n);

  assert.throws(
    () => parseMoney('50.01', { max: customLimit }),
    (err) => err instanceof ApiError && err.code === 'PRICE_LIMIT_EXCEEDED' && err.status === 400,
  );

  // Exceeding global MAX_MONEY_UNITS
  assert.throws(
    () => parseMoney('10000000000.00'),
    (err) => err instanceof ApiError && err.code === 'PRICE_LIMIT_EXCEEDED' && err.status === 400,
  );
});

test('formatMoneyUnits formats BigInt minor units to two-decimal strings', () => {
  assert.equal(formatMoneyUnits(0n), '0.00');
  assert.equal(formatMoneyUnits(1n), '0.01');
  assert.equal(formatMoneyUnits(99n), '0.99');
  assert.equal(formatMoneyUnits(100n), '1.00');
  assert.equal(formatMoneyUnits(4000n), '40.00');
  assert.equal(formatMoneyUnits(MAX_MONEY_UNITS), MAX_MONEY_STRING);

  // Capable of large aggregate report amounts without single-order limit
  const hugeAmount = 500000000000000n; // $5,000,000,000,000.00
  assert.equal(formatMoneyUnits(hugeAmount), '5000000000000.00');
});

test('formatMoneyUnits rejects non-BigInt and negative values', () => {
  assert.throws(() => formatMoneyUnits(4000), TypeError);
  assert.throws(() => formatMoneyUnits('4000'), TypeError);
  assert.throws(() => formatMoneyUnits(null), TypeError);
  assert.throws(() => formatMoneyUnits(-1n), RangeError);
});

test('arithmetic prevents IEEE 754 floating-point errors (0.10 + 0.20 = 0.30)', () => {
  // Classic JavaScript floating point issue demonstration
  assert.notEqual(0.1 + 0.2, 0.3);

  // Exact BigInt arithmetic via money helpers
  const tenCents = parseMoney('0.10'); // 10n
  const twentyCents = parseMoney('0.20'); // 20n
  const thirtyCents = parseMoney('0.30'); // 30n

  const sum = addMoney(tenCents, twentyCents);
  assert.equal(sum, thirtyCents);
  assert.equal(formatMoneyUnits(sum), '0.30');
});

test('multiplyMoney performs integer quantity multiplication and rejects invalid inputs', () => {
  const unitPrice = parseMoney('19.99'); // 1999n

  assert.equal(multiplyMoney(unitPrice, 0), 0n);
  assert.equal(multiplyMoney(unitPrice, 1), 1999n);
  assert.equal(multiplyMoney(unitPrice, 3), 5997n);
  assert.equal(formatMoneyUnits(multiplyMoney(unitPrice, 3)), '59.97');
  assert.equal(multiplyMoney(unitPrice, 3n), 5997n);
  assert.equal(multiplyMoney(unitPrice, '3'), 5997n);

  // Rejects negative quantities
  assert.throws(() => multiplyMoney(unitPrice, -1), RangeError);
  assert.throws(() => multiplyMoney(unitPrice, -1n), RangeError);

  // Rejects fractional / float quantities
  assert.throws(() => multiplyMoney(unitPrice, 1.5), TypeError);
  assert.throws(() => multiplyMoney(unitPrice, 'abc'), TypeError);

  // Rejects non-BigInt priceUnits
  assert.throws(() => multiplyMoney(1999, 2), TypeError);
});

test('addMoney sums multiple amounts and validates inputs', () => {
  assert.equal(addMoney(), 0n);
  assert.equal(addMoney(100n), 100n);
  assert.equal(addMoney(100n, 250n, 50n), 400n);
  assert.equal(formatMoneyUnits(addMoney(100n, 250n, 50n)), '4.00');

  assert.throws(() => addMoney(100n, 50), TypeError);
  assert.throws(() => addMoney(100n, -50n), RangeError);
});

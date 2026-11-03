import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTwelveDataQuoteTimestamp } from '../../server/twelve-data.ts';

test('normalizes Twelve Data Unix timestamps in seconds', () => {
  assert.equal(
    parseTwelveDataQuoteTimestamp(1793700000, '2026-11-03 10:00:00'),
    new Date(1793700000 * 1000).toISOString(),
  );
});

test('normalizes Twelve Data Unix timestamps in milliseconds', () => {
  const milliseconds = 1793700000000;
  assert.equal(
    parseTwelveDataQuoteTimestamp(milliseconds, null),
    new Date(milliseconds).toISOString(),
  );
});

test('uses ISO datetime fallback only when timezone is explicit', () => {
  assert.equal(
    parseTwelveDataQuoteTimestamp(null, '2026-11-03T10:00:00Z'),
    '2026-11-03T10:00:00.000Z',
  );
  assert.equal(
    parseTwelveDataQuoteTimestamp(null, '2026-11-03T10:00:00+02:00'),
    '2026-11-03T08:00:00.000Z',
  );
});

test('rejects ambiguous timezone-less datetime rather than guessing', () => {
  assert.equal(parseTwelveDataQuoteTimestamp(null, '2026-11-03 10:00:00'), null);
});

test('rejects invalid or non-positive Unix timestamps', () => {
  assert.equal(parseTwelveDataQuoteTimestamp('not-a-time', '2026-11-03T10:00:00Z'), null);
  assert.equal(parseTwelveDataQuoteTimestamp(0, '2026-11-03T10:00:00Z'), null);
});

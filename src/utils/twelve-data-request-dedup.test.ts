import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchProviderResponse } from '../../server/twelve-data.ts';

test('coalesces identical concurrent Twelve Data requests and clones responses', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return new Response(JSON.stringify({ values: [{ close: '2345.6' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const url = 'https://api.twelvedata.com/time_series?symbol=TEST%2FUSD&interval=1min&dedupe-test=concurrent';
    const responses = await Promise.all([
      fetchProviderResponse(url),
      fetchProviderResponse(url),
      fetchProviderResponse(url),
    ]);

    assert.equal(calls, 1);
    assert.equal(responses.length, 3);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    for (const payload of payloads) {
      assert.equal(payload.values[0].close, '2345.6');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not coalesce different Twelve Data request URLs', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const base = 'https://api.twelvedata.com/time_series?symbol=TEST%2FUSD';
    const responses = await Promise.all([
      fetchProviderResponse(`${base}&interval=1min`),
      fetchProviderResponse(`${base}&interval=5min`),
    ]);

    assert.equal(calls, 2);
    assert.equal(responses.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSignalQuality } from './signal-quality.ts';

const valid = {
  decision: 'BUY' as const,
  hasTradePlan: true,
  isLiveVerified: true,
  isStale: false,
  htfRequired: true,
  htfVerified: true,
};

test('grades signal quality using documented score bands', () => {
  assert.equal(assessSignalQuality({ ...valid, score: 91 }).grade, 'A+');
  assert.equal(assessSignalQuality({ ...valid, score: 80 }).grade, 'A');
  assert.equal(assessSignalQuality({ ...valid, score: 65 }).grade, 'B');
  assert.equal(assessSignalQuality({ ...valid, score: 50 }).grade, 'C');
  assert.equal(assessSignalQuality({ ...valid, score: 20 }).grade, 'Unqualified');
});

test('does not qualify a high score when hard safety gates fail', () => {
  const stale = assessSignalQuality({ ...valid, score: 96, isStale: true });
  assert.equal(stale.tradeEligible, false);
  assert.ok(stale.blockers.includes('Market data is stale'));

  const missingHtf = assessSignalQuality({ ...valid, score: 90, htfVerified: false });
  assert.equal(missingHtf.tradeEligible, false);
  assert.ok(missingHtf.blockers.includes('Required H1/H4 confirmation is unavailable'));

  const waiting = assessSignalQuality({ ...valid, score: 99, decision: 'WAIT' });
  assert.equal(waiting.tradeEligible, false);
});

test('qualifies only a fresh live signal with plan, confirmation and A-grade score', () => {
  const result = assessSignalQuality({ ...valid, score: 85 });
  assert.equal(result.tradeEligible, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.label, 'High-confluence setup');
});

test('clamps invalid scores to 0..100', () => {
  assert.equal(assessSignalQuality({ ...valid, score: 150 }).score, 100);
  assert.equal(assessSignalQuality({ ...valid, score: -5 }).score, 0);
});

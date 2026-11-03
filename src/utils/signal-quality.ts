export type SignalQualityGrade = 'A+' | 'A' | 'B' | 'C' | 'Unqualified';

export interface SignalQualityInput {
  score: number;
  decision: 'BUY' | 'SELL' | 'WAIT';
  hasTradePlan: boolean;
  isLiveVerified: boolean;
  isStale: boolean;
  htfRequired: boolean;
  htfVerified: boolean;
}

export interface SignalQualityAssessment {
  score: number;
  grade: SignalQualityGrade;
  label: string;
  tradeEligible: boolean;
  blockers: string[];
}

/**
 * Converts the deterministic confluence score into an execution-quality
 * assessment. A high numeric score never overrides hard data/setup gates.
 */
export function assessSignalQuality(input: SignalQualityInput): SignalQualityAssessment {
  const score = Math.max(0, Math.min(100, Math.round(Number.isFinite(input.score) ? input.score : 0)));
  const grade: SignalQualityGrade =
    score >= 85 ? 'A+' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : 'Unqualified';

  const blockers: string[] = [];
  if (input.decision === 'WAIT') blockers.push('No actionable BUY/SELL decision');
  if (!input.hasTradePlan) blockers.push('No validated trade plan');
  if (!input.isLiveVerified) blockers.push('Market data is not live-verified');
  if (input.isStale) blockers.push('Market data is stale');
  if (input.htfRequired && !input.htfVerified) blockers.push('Required H1/H4 confirmation is unavailable');
  if (score < 75) blockers.push('Quality score is below the A-grade execution threshold');

  const tradeEligible = blockers.length === 0;
  const label = tradeEligible
    ? (grade === 'A+' ? 'High-confluence setup' : 'Qualified setup')
    : 'WAIT — quality gate not passed';

  return { score, grade, label, tradeEligible, blockers };
}

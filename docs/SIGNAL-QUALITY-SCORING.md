# Signal Quality Scoring

Aegis Alpha reports a deterministic confluence score from 0–100 for live market analysis. The score is composed from the existing technical-analysis engine:

| Factor | Maximum |
| --- | ---: |
| Trend alignment | 20 |
| Market structure | 20 |
| Liquidity confirmation | 20 |
| Entry trigger | 15 |
| Risk/reward | 15 |
| Data quality | 10 |
| **Total** | **100** |

## Grades

- **A+**: 85–100
- **A**: 75–84
- **B**: 60–74
- **C**: 45–59
- **Unqualified**: 0–44

## Execution-quality gate

A score is not a probability of profit and is not a standalone instruction to trade. The API separately reports `signalQuality.tradeEligible`. A live signal is eligible for manual Demo approval only when all of the following are true:

1. The deterministic decision is BUY or SELL.
2. A validated trade plan is present.
3. The market feed is live-verified and not stale.
4. Required H1/H4 confirmation is available when higher-timeframe confirmation was requested.
5. The quality score is at least 75 (Grade A or A+).

Any failed condition produces explicit blockers and keeps the signal out of the Broker Panel approval flow. Screenshot-only and caller-provided candle analyses are not live-verified and therefore cannot pass the execution gate.

## Limitations

The factor scores are rule-based heuristic points, not statistically calibrated probabilities. The grade bands are operational filters, not evidence of an expected win rate. Validate the scoring against a sufficiently large, out-of-sample trade dataset before using it to make claims about predictive performance. Economic news, spreads, slippage and broker execution conditions are not fully represented in this score.

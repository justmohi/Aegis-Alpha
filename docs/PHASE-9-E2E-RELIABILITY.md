# Phase 9 — End-to-End Reliability & Recovery

## Scope

This phase hardens recovery for already-claimed MT5 Demo orders. It does not enable broker routing and does not change the Demo-only, XAUUSD-only, manual-approval, 0.03-lot hard cap, or monetary risk controls.

## Change in this phase

The reconciliation endpoint returns an `orders` array of up to 20 CLAIMED orders. The EA previously attempted to read `id`, `symbol`, `side`, and `volume` directly from the response root. It therefore could not reliably reconcile the array payload. It also considered only one object, which could starve later claimed orders when the first had no matching deal history.

The EA now:
- Locates the `orders` array and extracts each complete JSON object while respecting quoted strings and escaped characters.
- Checks each claimed order against the last seven days of MT5 deal history.
- Requires matching EA magic number, unique order marker, configured MT5 symbol, entry direction, positive fill volume, and positive deal price.
- Aggregates matching entry fills into a volume-weighted average execution price.
- Refuses reconciliation if aggregated fill volume exceeds the approved volume (with a 0.0005 lot tolerance).
- Reports matching evidence through the existing idempotent result endpoint.
- Leaves unmatched or ambiguous orders CLAIMED for later/manual review; it never re-queues or re-sends them.

## Required validation before enabling any routing

1. Compile `mt5/AegisAlphaDemoEA.mq5` in MetaEditor and confirm zero errors.
2. Attach only to an Exness MT5 Demo account; confirm the EA's Demo guard and WebRequest allow-list.
3. Create at least two CLAIMED test orders in Demo. Ensure the oldest order has no matching history marker and a later order does.
4. Confirm the later matching order reconciles while the unmatched order remains CLAIMED.
5. Test one order with multiple partial entry deals and confirm actual volume and weighted average price match MT5 history.
6. Test mismatched symbol, side, magic number, marker, and over-volume evidence; each must remain unresolved and must not be marked EXECUTED.
7. Retry an identical acknowledgement and confirm backend idempotency; submit conflicting execution evidence and confirm it is rejected.
8. Verify no order is automatically re-queued or sent again after an acknowledgement timeout.

## Validation status

Repository CI can validate TypeScript/build/test workflows, but it does not compile MQL5 or connect to an MT5 terminal. MetaEditor compilation and the Demo scenarios above remain mandatory manual checks. Keep `BROKER_DEMO_ENABLED=false` until all required checks pass.

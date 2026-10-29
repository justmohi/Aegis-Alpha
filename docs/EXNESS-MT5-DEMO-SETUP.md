# Aegis Alpha — Exness MT5 Demo bridge

## Safety model

- Demo-only: both the EA and backend verify the account is Demo; the server requires a recent authenticated Demo heartbeat before queuing/claiming orders.
- Initial instrument is XAUUSD only. Adjust the EA's `InpTradeSymbol` to the exact Market Watch name (for example `XAUUSDm`) and ensure it matches the signal symbol.
- Manual approval is required. Only a fresh, live-verified BUY/SELL plan can be queued; WAIT, stale, and screenshot-only signals are rejected.
- Volume is limited to 0.01–0.03 lots. Orders expire after 90 seconds if not claimed.
- Never commit tokens, account passwords, or API credentials.

## Render environment

Create a persistent PostgreSQL database and configure these environment variables on the Render backend service:

- `DATABASE_URL`: Render PostgreSQL internal connection URL (prefer the private/internal URL when the service and database share a region).
- `BROKER_DEMO_ENABLED=true`: leave unset/false until PostgreSQL and the EA are configured.
- `BROKER_EA_TOKEN`: long random secret used only by the MT5 EA.
- `BROKER_ADMIN_TOKEN`: a different long random secret entered in the Broker panel.
- `FRONTEND_ORIGIN=https://aegis-alphatrading.netlify.app`: comma-separated exact allowed frontend origins if additional domains are used.

Restart/redeploy the backend after setting environment variables. Do not put either token in frontend build variables or source code.

## Netlify

The Broker panel defaults to the current Render backend URL. If your Render URL changes, set `VITE_API_BASE_URL` to the backend origin and redeploy Netlify.

## MT5 EA installation

1. In Exness Personal Area, open an MT5 Demo account. Sign in to the **desktop** MetaTrader 5 terminal with that Demo account.
2. Open MT5 → File → Open Data Folder → `MQL5/Experts`.
3. Copy `mt5/AegisAlphaDemoEA.mq5` there, open it in MetaEditor, and compile. Review compiler output before use.
4. In MT5, open Tools → Options → Expert Advisors. Enable “Allow WebRequest for listed URL” and add the exact Render backend origin, e.g. `https://aegis-alpha-4ttu.onrender.com`.
5. Attach the EA to an XAUUSD chart. Set `InpBackendUrl`, `InpEaToken` (the Render `BROKER_EA_TOKEN` value), and `InpTradeSymbol` to the exact broker symbol. Enable Algo Trading only after verifying the account is Demo.
6. Verify the Broker panel shows “MT5 DEMO CONNECTED”. If not, check the Experts and Journal tabs and Render logs.
7. Set `BROKER_DEMO_ENABLED=true` only after the heartbeat and database are working. Enter `BROKER_ADMIN_TOKEN` in the panel and approve a fresh live-verified XAUUSD signal to test.

## Important limitations

- The EA reports a successful order fill when MT5 returns a successful trade result; inspect the terminal and account history for final confirmation.
- This initial bridge does not manage open positions, modify stops, or close positions after entry.
- Do not use on a real account. The server and EA intentionally block non-Demo accounts.
- The CI workflow checks TypeScript lint and the frontend production build. MetaEditor compilation must be checked in desktop MT5/MetaEditor.

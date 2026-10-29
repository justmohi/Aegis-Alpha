CREATE TABLE IF NOT EXISTS aegis_mt5_state (
  id TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS aegis_mt5_orders (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING_APPROVAL','QUEUED','CLAIMED','EXECUTED','REJECTED','EXPIRED','FAILED')),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  volume NUMERIC(8,3) NOT NULL,
  entry_price NUMERIC(20,8) NOT NULL,
  stop_loss NUMERIC(20,8) NOT NULL,
  take_profit NUMERIC(20,8) NOT NULL,
  signal_id TEXT NOT NULL UNIQUE,
  mt5_ticket TEXT,
  execution_price NUMERIC(20,8),
  message TEXT,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS aegis_mt5_orders_status_created ON aegis_mt5_orders(status, created_at);

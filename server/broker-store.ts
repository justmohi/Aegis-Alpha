import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured; broker routing is disabled.');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
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
    `).then(() => {});
  }
  return schemaReady;
}

export type BrokerOrder = {
  id: string; createdAt: string; expiresAt: string; status: string;
  symbol: string; side: 'BUY'|'SELL'; volume: number; entryPrice: number;
  stopLoss: number; takeProfit: number; signalId: string;
  mt5Ticket?: string|null; executionPrice?: number|null; message?: string|null;
};

function mapOrder(row: any): BrokerOrder {
  return {
    id: row.id, createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(), status: row.status,
    symbol: row.symbol, side: row.side, volume: Number(row.volume),
    entryPrice: Number(row.entry_price), stopLoss: Number(row.stop_loss),
    takeProfit: Number(row.take_profit), signalId: row.signal_id,
    mt5Ticket: row.mt5_ticket, executionPrice: row.execution_price == null ? null : Number(row.execution_price),
    message: row.message,
  };
}

export async function brokerStatus() {
  await ensureSchema();
  const p = getPool();
  const [state, counts] = await Promise.all([
    p.query('SELECT payload, updated_at FROM aegis_mt5_state WHERE id=$1', ['terminal']),
    p.query('SELECT status, COUNT(*)::int AS count FROM aegis_mt5_orders GROUP BY status'),
  ]);
  const terminal = state.rows[0]?.payload || null;
  const updatedAt = state.rows[0]?.updated_at ? new Date(state.rows[0].updated_at).toISOString() : null;
  const fresh = Boolean(updatedAt && Date.now() - new Date(updatedAt).getTime() < 60000 && terminal?.demo === true);
  return { enabled: process.env.BROKER_DEMO_ENABLED === 'true', mode: 'DEMO_ONLY', databaseConfigured: true, terminalConnected: fresh, terminal, terminalUpdatedAt: updatedAt, counts: Object.fromEntries(counts.rows.map((r: any) => [r.status, r.count])) };
}

export async function heartbeat(payload: any) {
  await ensureSchema();
  if (payload?.demo !== true) throw new Error('DEMO_ONLY_GUARD: MT5 terminal must be a Demo account.');
  if (!/(demo|trial)/i.test(String(payload?.server || ''))) throw new Error('DEMO_ONLY_GUARD: MT5 server name must identify a demo server.');
  const safe = {
    demo: true, server: String(payload.server).slice(0, 120),
    login: String(payload.login || '').slice(0, 40),
    company: String(payload.company || '').slice(0, 120),
    symbol: String(payload.symbol || '').slice(0, 32),
    connected: payload.connected === true,
    terminalBuild: String(payload.terminalBuild || '').slice(0, 32),
  };
  await getPool().query(`
    INSERT INTO aegis_mt5_state(id, updated_at, payload) VALUES ('terminal', NOW(), $1::jsonb)
    ON CONFLICT(id) DO UPDATE SET updated_at=NOW(), payload=EXCLUDED.payload
  `, [JSON.stringify(safe)]);
  return { accepted: true };
}

export async function createOrder(input: any): Promise<BrokerOrder> {
  await ensureSchema();
  const status = await brokerStatus();
  if (process.env.BROKER_DEMO_ENABLED !== 'true') throw new Error('Broker routing is disabled. Set BROKER_DEMO_ENABLED=true to enable Demo-only routing.');
  if (!status.terminalConnected) throw new Error('MT5 Demo terminal is not connected or its heartbeat is stale.');
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 90000);
  const payload = { source: 'Aegis Alpha manual approval', mode: 'DEMO_ONLY' };
  const result = await getPool().query(`
    INSERT INTO aegis_mt5_orders
      (id, expires_at, status, symbol, side, volume, entry_price, stop_loss, take_profit, signal_id, payload)
    VALUES ($1, $2, 'QUEUED', $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    RETURNING *
  `, [id, expiresAt, input.symbol, input.side, input.volume, input.entryPrice, input.stopLoss, input.takeProfit, input.signalId, JSON.stringify(payload)]);
  return mapOrder(result.rows[0]);
}

export async function listOrders(limit = 50) {
  await ensureSchema();
  const result = await getPool().query('SELECT * FROM aegis_mt5_orders ORDER BY created_at DESC LIMIT $1', [Math.min(100, Math.max(1, limit))]);
  return result.rows.map(mapOrder);
}

export async function claimNextOrder() {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE aegis_mt5_orders SET status='EXPIRED', updated_at=NOW(), message='Order expired before execution' WHERE status IN ('QUEUED','CLAIMED') AND expires_at < NOW()");
    const result = await client.query(`
      SELECT * FROM aegis_mt5_orders
      WHERE status='QUEUED' AND expires_at > NOW()
      ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
    `);
    if (!result.rows.length) { await client.query('COMMIT'); return null; }
    const row = result.rows[0];
    const changed = await client.query("UPDATE aegis_mt5_orders SET status='CLAIMED', updated_at=NOW() WHERE id=$1 AND status='QUEUED' RETURNING *", [row.id]);
    await client.query('COMMIT');
    return changed.rows[0] ? mapOrder(changed.rows[0]) : null;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

export async function updateOrder(id: string, result: any) {
  await ensureSchema();
  const statusMap: Record<string,string> = { EXECUTED: 'EXECUTED', REJECTED: 'REJECTED', FAILED: 'FAILED' };
  const status = statusMap[String(result?.status || '').toUpperCase()];
  if (!status) throw new Error('Invalid execution status.');
  const ticket = result?.ticket == null ? null : String(result.ticket).slice(0, 64);
  const price = Number(result?.executionPrice);
  const message = String(result?.message || '').slice(0, 500);
  const updated = await getPool().query(`
    UPDATE aegis_mt5_orders SET status=$2, updated_at=NOW(), mt5_ticket=$3,
      execution_price=$4, message=$5 WHERE id=$1 AND status IN ('CLAIMED','QUEUED') RETURNING *
  `, [id, status, ticket, Number.isFinite(price) && price > 0 ? price : null, message]);
  if (!updated.rows[0]) throw new Error('Order not found or no longer awaiting execution update.');
  return mapOrder(updated.rows[0]);
}

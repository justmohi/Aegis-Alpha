import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import type { SignalAnalysisResult } from '../types/trading';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'https://aegis-alpha-4ttu.onrender.com';

type BrokerStatus = {
  enabled?: boolean; mode?: string; databaseConfigured?: boolean; terminalConnected?: boolean;
  terminal?: { demo?: boolean; server?: string; login?: string; company?: string; symbol?: string; connected?: boolean } | null;
  terminalUpdatedAt?: string | null; error?: string;
};
type Order = {
  id: string; createdAt: string; expiresAt: string; status: string; symbol: string;
  side: string; volume: number; entryPrice: number; stopLoss: number; takeProfit: number;
  mt5Ticket?: string | null; executionPrice?: number | null; message?: string | null;
};

export const BrokerPanel: React.FC<{ signal: SignalAnalysisResult | null }> = ({ signal }) => {
  const [adminToken, setAdminToken] = useState('');
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [volume, setVolume] = useState('0.01');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const s = await fetch(`${API_BASE}/api/broker/status`);
      const sd = await s.json();
      setStatus(sd);
      if (adminToken) {
        const o = await fetch(`${API_BASE}/api/broker/orders`, { headers: { 'x-broker-admin-token': adminToken } });
        const od = await o.json();
        if (!o.ok) throw new Error(od.error || 'Could not load broker orders.');
        setOrders(od.orders || []);
      }
    } catch (e: any) { setError(e.message || 'Broker status unavailable.'); }
    finally { setLoading(false); }
  }, [adminToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  const approve = async () => {
    if (!signal || !adminToken) { setError('Admin token and current signal are required.'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/broker/orders/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-broker-admin-token': adminToken },
        body: JSON.stringify({
          signalId: signal.id || signal.timestamp || '',
          signalTimestamp: signal.timestamp,
          symbol: signal.instrument,
          decision: signal.decision,
          tradePlan: signal.tradePlan,
          isLiveVerified: signal.isLiveVerified,
          isStale: signal.isStale,
          volume: Number(volume),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Order approval failed.');
      setMessage('Demo order queued. It expires in 90 seconds if the MT5 EA does not claim it.');
      await refresh();
    } catch (e: any) { setError(e.message || 'Order approval failed.'); }
    finally { setLoading(false); }
  };

  const connected = status?.terminalConnected === true && status?.terminal?.demo === true;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Exness MT5 Demo Bridge</h2>
          <p className="text-sm text-slate-400 mt-1">XAUUSD · Manual approval · Demo-only routing</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${connected ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>
          {connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          {connected ? 'MT5 DEMO CONNECTED' : 'MT5 DEMO NOT CONNECTED'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4">
          <ShieldCheck className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-xs text-slate-400">Account safety</p><p className="font-semibold text-slate-100">DEMO ONLY</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4">
          <Clock className="w-5 h-5 text-amber-300 mb-2" />
          <p className="text-xs text-slate-400">Order expiry</p><p className="font-semibold text-slate-100">90 seconds</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4">
          <RefreshCw className="w-5 h-5 text-sky-300 mb-2" />
          <p className="text-xs text-slate-400">Queue persistence</p><p className="font-semibold text-slate-100">{status?.databaseConfigured ? 'PostgreSQL configured' : 'Database not ready'}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4 space-y-3">
        <h3 className="font-semibold text-slate-100">Connection status</h3>
        {status?.terminal ? (
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <p className="text-slate-400">Demo server: <span className="text-slate-200">{status.terminal.server}</span></p>
            <p className="text-slate-400">MT5 login: <span className="text-slate-200">{status.terminal.login || '—'}</span></p>
            <p className="text-slate-400">Symbol: <span className="text-slate-200">{status.terminal.symbol || '—'}</span></p>
            <p className="text-slate-400">Last heartbeat: <span className="text-slate-200">{status.terminalUpdatedAt ? new Date(status.terminalUpdatedAt).toLocaleString() : '—'}</span></p>
          </div>
        ) : <p className="text-sm text-slate-400">No verified MT5 Demo heartbeat received yet.</p>}
        {status?.error && <p className="text-sm text-amber-300">{status.error}</p>}
        <button onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4 space-y-3">
        <h3 className="font-semibold text-slate-100">Manual order approval</h3>
        <p className="text-sm text-slate-400">Admin token is held in this page’s memory only. Set BROKER_ADMIN_TOKEN in Render and never put it in frontend source.</p>
        <label className="block text-xs text-slate-400">Admin token</label>
        <input type="password" autoComplete="off" value={adminToken} onChange={e => setAdminToken(e.target.value)} placeholder="Enter Render BROKER_ADMIN_TOKEN" className="w-full rounded-lg border border-slate-700 bg-[#070b14] px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-300">Volume</label>
          <select value={volume} onChange={e => setVolume(e.target.value)} className="rounded-lg border border-slate-700 bg-[#070b14] px-3 py-2 text-sm text-slate-100">
            <option value="0.01">0.01 lot</option><option value="0.02">0.02 lot</option><option value="0.03">0.03 lot (max)</option>
          </select>
          <button onClick={() => void approve()} disabled={loading || !signal || !adminToken} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40">Approve current signal for Demo</button>
        </div>
        {signal && <div className="rounded-lg border border-slate-800 p-3 text-sm">
          <p className="text-slate-400">Current signal: <span className="font-semibold text-slate-100">{signal.instrument} / {signal.decision}</span></p>
          <p className="text-slate-400 mt-1">Entry: <span className="text-slate-200">{signal.tradePlan?.entryZone?.optimal ?? '—'}</span> · SL: <span className="text-slate-200">{signal.tradePlan?.stopLoss ?? '—'}</span> · TP1: <span className="text-slate-200">{signal.tradePlan?.takeProfit1 ?? '—'}</span></p>
          {!signal.isLiveVerified && <p className="mt-2 text-amber-300">This signal is not verified as live market data and will be rejected by the server.</p>}
        </div>}
        {message && <p className="flex items-start gap-2 text-sm text-emerald-300"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />{message}</p>}
        {error && <p className="flex items-start gap-2 text-sm text-rose-300"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>}
      </div>

      <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4">
        <div className="flex items-center justify-between gap-3 mb-3"><h3 className="font-semibold text-slate-100">Recent execution history</h3><button onClick={() => void refresh()} className="text-xs text-amber-300 hover:text-amber-200">Refresh</button></div>
        {!adminToken ? <p className="text-sm text-slate-400">Enter the admin token to view order history.</p> : orders.length === 0 ? <p className="text-sm text-slate-400">No broker orders yet.</p> : (
          <div className="space-y-2">{orders.map(order => <div key={order.id} className="rounded-lg border border-slate-800 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-slate-100">{order.symbol} {order.side} · {order.volume.toFixed(2)} lot</span><span className={`text-xs font-bold ${order.status === 'EXECUTED' ? 'text-emerald-300' : order.status === 'FAILED' || order.status === 'REJECTED' ? 'text-rose-300' : 'text-amber-300'}`}>{order.status}</span></div>
            <p className="mt-1 text-xs text-slate-400">Entry {order.entryPrice} · SL {order.stopLoss} · TP {order.takeProfit} {order.mt5Ticket ? `· Ticket ${order.mt5Ticket}` : ''} {order.executionPrice ? `· Fill ${order.executionPrice}` : ''}</p>
            {order.message && <p className="mt-1 text-xs text-slate-400">{order.message}</p>}
            <p className="mt-1 text-[11px] text-slate-500">{new Date(order.createdAt).toLocaleString()}</p>
          </div>)}</div>
        )}
      </div>
      <p className="text-xs text-slate-500">Use this bridge for demo validation only. The EA will reject non-demo accounts; do not add live credentials or enable real-account trading.</p>
    </section>
  );
};

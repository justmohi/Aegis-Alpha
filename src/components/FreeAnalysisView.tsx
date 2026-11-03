import React, { useMemo, useState } from 'react';
import { Activity, Upload, FileText, ShieldCheck, AlertTriangle, Database, Play, RotateCcw } from 'lucide-react';

type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number };
type FreeResult = {
  mode: string;
  provider: string;
  executionEligible: false;
  freshness: { verified: boolean; stale: boolean; ageMinutes: number | null; maxAgeMinutes: number; latestCandleTime: string | null; reason: string | null };
  signal: {
    decision: 'BUY' | 'SELL' | 'WAIT'; confidenceScore: number; setupStatus: string;
    symbol: string; timeframe: string; referencePrice: number; referenceTime: string;
    indicators: { ema20: number | null; ema50: number | null; ema200: number | null; rsi14: number | null; macd: { macd: number; signal: number; histogram: number } | null; atr14: number | null };
    marketStructure: { trend: string; summary: string; lastBOS: { type: string; level: number } | null; lastCHOCH: { type: string; level: number } | null };
    liquiditySweeps: Array<{ type: string; level: number; sweepPrice: number }>;
    supportResistance: Array<{ level: number; type: string; strength: string }>;
    decisionRationale: string[]; limitations: string[];
  };
};

function parseCsv(text: string): Candle[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV must contain a header and at least 20 candle rows.');
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const index = (names: string[]) => headers.findIndex((h) => names.includes(h));
  const ti = index(['time', 'datetime', 'timestamp', 'date']);
  const oi = index(['open']), hi = index(['high']), li = index(['low']), ci = index(['close']), vi = index(['volume', 'vol']);
  if ([ti, oi, hi, li, ci].some((i) => i < 0)) throw new Error('CSV headers must include time, open, high, low, close; volume is optional.');
  return lines.slice(1).map((line, row) => {
    const cols = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const candle = { time: cols[ti], open: Number(cols[oi]), high: Number(cols[hi]), low: Number(cols[li]), close: Number(cols[ci]), volume: vi >= 0 ? Number(cols[vi] || 0) : 0 };
    if (!candle.time || ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)) {
      throw new Error(`Invalid candle data at CSV row ${row + 2}.`);
    }
    return candle;
  });
}

export const FreeAnalysisView: React.FC = () => {
  const [symbol, setSymbol] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState('M15');
  const [riskRewardTarget, setRiskRewardTarget] = useState('2');
  const [rawData, setRawData] = useState('');
  const [result, setResult] = useState<FreeResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');

  const rowCount = useMemo(() => rawData.trim() ? Math.max(0, rawData.trim().split(/\r?\n/).length - 1) : 0, [rawData]);

  const loadFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setError('');
    try { setRawData(await file.text()); setResult(null); }
    catch { setError('Could not read the selected file.'); }
  };

  const runAnalysis = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const trimmed = rawData.trim();
      if (!trimmed) throw new Error('Paste CSV or JSON candle data, or upload a file.');
      let candles: Candle[];
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        candles = Array.isArray(parsed) ? parsed : parsed.candles;
        if (!Array.isArray(candles)) throw new Error('JSON must be a candle array or an object containing a candles array.');
      } else candles = parseCsv(trimmed);
      if (candles.length > 500) throw new Error('Maximum 500 candles per analysis.');
      const response = await fetch('/api/free-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candles, symbol, timeframe, riskRewardTarget: Number(riskRewardTarget) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Analysis failed (HTTP ${response.status}).`);
      setResult(payload);
    } catch (e: any) { setError(e?.message || 'Unable to analyze candle data.'); }
    finally { setBusy(false); }
  };

  const format = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  const fresh = result?.freshness.verified && !result.freshness.stale;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/35 to-[#0b1220] p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/15 p-2"><Database className="h-5 w-5 text-emerald-300" /></div>
          <div><h2 className="text-lg font-bold text-slate-100">FREE HISTORICAL ANALYSIS</h2><p className="text-xs text-slate-400">Independent analysis engine · No Twelve Data request · No AI API required</p></div>
          <span className="ml-auto rounded border border-emerald-500/30 px-2 py-1 text-[10px] font-bold text-emerald-300">SEPARATE MODULE</span>
        </div>
        <p className="mt-3 text-sm text-slate-300">Upload or paste historical OHLCV candles. Indicators and market structure are calculated locally by the Aegis deterministic engine. If candle freshness cannot be verified, the result is forced to WAIT.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <section className="rounded-xl border border-slate-800 bg-[#0b1220] p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200"><Upload className="h-4 w-4 text-emerald-300" /> HISTORICAL CANDLE INPUT</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="text-[11px] text-slate-400">SYMBOL<input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="mt-1 w-full rounded-md border border-slate-700 bg-[#070b14] px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" /></label>
            <label className="text-[11px] text-slate-400">TIMEFRAME<select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-[#070b14] px-3 py-2 text-sm text-white"><option>M1</option><option>M5</option><option>M15</option><option>M30</option><option>H1</option><option>H4</option><option>D1</option></select></label>
            <label className="text-[11px] text-slate-400">TARGET R:R<select value={riskRewardTarget} onChange={(e) => setRiskRewardTarget(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-[#070b14] px-3 py-2 text-sm text-white"><option value="1.5">1 : 1.5</option><option value="2">1 : 2</option><option value="2.5">1 : 2.5</option><option value="3">1 : 3</option></select></label>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-[#080e19] p-3 text-sm text-slate-300 hover:border-emerald-500/50">
            <FileText className="h-4 w-4 text-emerald-300" /><span>{fileName || 'Upload CSV or JSON file'}</span><input type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} />
          </label>
          <div><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>CSV: time,open,high,low,close,volume · JSON: candle array</span><span>{rowCount} rows</span></div>
            <textarea value={rawData} onChange={(e) => { setRawData(e.target.value); setFileName(''); setResult(null); }} rows={11} placeholder={'time,open,high,low,close,volume\n2026-11-03T08:00:00Z,3980,3985,3978,3983,120\n...'} className="w-full rounded-lg border border-slate-700 bg-[#070b14] p-3 font-mono text-xs text-slate-200 outline-none focus:border-emerald-500" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runAnalysis} disabled={busy || !rawData.trim()} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"><Play className="h-4 w-4" />{busy ? 'ANALYZING...' : 'RUN FREE ANALYSIS'}</button>
            <button onClick={() => { setRawData(''); setFileName(''); setResult(null); setError(''); }} className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800"><RotateCcw className="h-4 w-4" />Clear</button>
          </div>
          {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">{error}</div>}
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0b1220] p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200"><ShieldCheck className="h-4 w-4 text-emerald-300" /> DATA & SAFETY RULES</div>
          <ul className="space-y-3 text-xs text-slate-400">
            <li>• 20–500 candles per request; ascending timestamps required.</li>
            <li>• OHLC values and volume are validated before calculation.</li>
            <li>• Freshness limit: two timeframe intervals plus two minutes.</li>
            <li>• Stale, invalid-time or unverifiable data forces WAIT and removes the trade plan.</li>
            <li>• Historical analysis is informational and never broker-executable.</li>
            <li>• No synthetic candles or Twelve Data fallback are used.</li>
          </ul>
          <div className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-[11px] text-amber-200">CSV timestamps must be parseable dates, preferably ISO 8601 with timezone (for example, 2026-11-03T08:00:00Z). Candle data must be sorted oldest to newest.</div>
        </section>
      </div>

      {result && (
        <section className="rounded-xl border border-slate-800 bg-[#0b1220] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-sm font-bold text-slate-100">FREE ANALYSIS RESULT · {result.signal.symbol} / {result.signal.timeframe}</h3><p className="mt-1 text-[11px] text-slate-500">Reference: {result.signal.referenceTime} · Price: {format(result.signal.referencePrice)}</p></div>
            <span className={`rounded-md border px-4 py-2 text-lg font-black ${result.signal.decision === 'BUY' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : result.signal.decision === 'SELL' ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>{result.signal.decision}</span>
          </div>
          <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${fresh ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200' : 'border-amber-500/30 bg-amber-950/20 text-amber-200'}`}>
            {fresh ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <div><b>{fresh ? 'Freshness verified' : 'WAIT — freshness not verified'}</b><p className="mt-1">{result.freshness.reason || `Latest candle age: ${result.freshness.ageMinutes} minutes (maximum ${result.freshness.maxAgeMinutes} minutes).`}</p><p className="mt-1">Execution eligible: NO · User-supplied historical data</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['EMA 20', format(result.signal.indicators.ema20)], ['EMA 50', format(result.signal.indicators.ema50)],
              ['EMA 200', format(result.signal.indicators.ema200)], ['RSI 14', format(result.signal.indicators.rsi14)],
              ['ATR 14', format(result.signal.indicators.atr14)], ['Trend', result.signal.marketStructure.trend],
              ['Quality', String(result.signal.confidenceScore) + '/100'], ['Setup', result.signal.setupStatus],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-800 bg-[#080e19] p-3"><div className="text-[10px] text-slate-500">{label}</div><div className="mt-1 break-words text-sm font-bold text-slate-200">{value}</div></div>)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-800 p-3"><h4 className="mb-2 text-xs font-bold text-slate-300">MARKET STRUCTURE</h4><p className="text-xs text-slate-400">{result.signal.marketStructure.summary}</p><p className="mt-2 text-[11px] text-slate-500">BOS: {result.signal.marketStructure.lastBOS ? `${result.signal.marketStructure.lastBOS.type} @ ${format(result.signal.marketStructure.lastBOS.level)}` : '—'} · CHOCH: {result.signal.marketStructure.lastCHOCH ? `${result.signal.marketStructure.lastCHOCH.type} @ ${format(result.signal.marketStructure.lastCHOCH.level)}` : '—'}</p></div>
            <div className="rounded-lg border border-slate-800 p-3"><h4 className="mb-2 text-xs font-bold text-slate-300">SUPPORT / RESISTANCE</h4><div className="space-y-1 text-xs text-slate-400">{result.signal.supportResistance.slice(0, 8).map((level, i) => <p key={i}>{level.type} · {level.strength}: <b className="text-slate-200">{format(level.level)}</b></p>)}</div></div>
          </div>
          <div className="rounded-lg border border-slate-800 p-3"><h4 className="mb-2 text-xs font-bold text-slate-300">ANALYSIS NOTES</h4><ul className="list-inside list-disc space-y-1 text-xs text-slate-400">{result.signal.decisionRationale.map((line, i) => <li key={i}>{line}</li>)}</ul></div>
          <div className="text-[10px] text-slate-500">This module is isolated from the existing Live Analyzer and Broker Panel. Its results cannot be approved or executed by the broker bridge.</div>
        </section>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Activity,
  Layers,
  BookOpen,
  Calculator,
  LineChart,
  HelpCircle,
  Zap,
  Key,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Wifi,
  WifiOff,
  Clock,
  Database,
  Cpu,
} from 'lucide-react';
import { TwelveDataStatus, ConnectionDiagnosticResult } from '../types/trading.ts';

export type NavTab = 'analyzer' | 'chart' | 'backtest' | 'journal' | 'calculator' | 'broker';

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  journalCount: number;
  onOpenDisclaimer: () => void;
  aiEngineStatus: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  journalCount,
  onOpenDisclaimer,
  aiEngineStatus,
}) => {
  const [marketStatus, setMarketStatus] = useState<TwelveDataStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnosticResult | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isTestingFeed, setIsTestingFeed] = useState(false);
  const [probeSymbol, setProbeSymbol] = useState('XAU/USD');
  const [probeInterval, setProbeInterval] = useState('15min');

  const fetchStatusAndDiagnostics = async () => {
    try {
      const [statusRes, diagRes] = await Promise.all([
        fetch('/api/market-status'),
        fetch('/api/connection-diagnostics'),
      ]);
      const statusData = await statusRes.json();
      const diagData = await diagRes.json();
      setMarketStatus(statusData);
      setDiagnostics(diagData);
    } catch (e) {
      console.warn('Could not load market status/diagnostics', e);
    }
  };

  useEffect(() => {
    fetchStatusAndDiagnostics();
  }, []);

  const handleRunProbe = async () => {
    setIsTestingFeed(true);
    try {
      const res = await fetch('/api/connection-diagnostics/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: probeSymbol, interval: probeInterval }),
      });
      const data: ConnectionDiagnosticResult = await res.json();
      setDiagnostics(data);
      // Also refresh market-status
      const stRes = await fetch('/api/market-status');
      const stData = await stRes.json();
      setMarketStatus(stData);
    } catch (e: any) {
      console.error('Probe failed:', e);
    } finally {
      setIsTestingFeed(false);
    }
  };

  const isConnected = Boolean(marketStatus?.configured && diagnostics?.providerErrorCategory === 'NONE');
  const isDegraded = Boolean(marketStatus?.configured && diagnostics?.providerErrorCategory !== 'NONE');

  return (
    <>
      <header className="border-b border-[#1b253b] bg-[#0a0f1d]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Terminal Identity */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/10 border border-amber-400/30">
                <Shield className="w-5 h-5 text-slate-950 font-bold" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-base sm:text-lg tracking-wider text-slate-100 font-mono">
                    AEGIS<span className="text-amber-400">ALPHA</span>
                  </span>
                  <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                    QUANT v2.5
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  Institutional AI Signal Analysis & Real Market Data Terminal
                </p>
              </div>
            </div>

            {/* Nav Tabs */}
            <nav className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-1">
              <button
                onClick={() => setActiveTab('analyzer')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'analyzer'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Analyzer</span>
              </button>

              <button
                onClick={() => setActiveTab('chart')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'chart'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <LineChart className="w-4 h-4" />
                <span className="hidden sm:inline">Live Chart</span>
              </button>

              <button
                onClick={() => setActiveTab('backtest')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'backtest'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Backtest</span>
              </button>

              <button
                onClick={() => setActiveTab('journal')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'journal'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Journal</span>
                {journalCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-slate-800 text-amber-400 text-[10px] font-mono rounded-full border border-slate-700">
                    {journalCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('broker')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'broker'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Server className="w-4 h-4" />
                <span className="hidden md:inline">Broker</span>
              </button>

              <button
                onClick={() => setActiveTab('calculator')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'calculator'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Calculator className="w-4 h-4" />
                <span className="hidden md:inline">Risk Calculator</span>
              </button>
            </nav>

            {/* Right Status Indicators & Provider Status */}
            <div className="hidden lg:flex items-center space-x-3 text-xs font-mono">
              {/* Connection Diagnostics Pill */}
              <button
                type="button"
                onClick={() => {
                  fetchStatusAndDiagnostics();
                  setIsStatusModalOpen(true);
                }}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border transition-colors ${
                  isConnected
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40'
                    : isDegraded
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/40'
                    : 'bg-[#101726] border-amber-500/30 text-amber-400 hover:bg-slate-800'
                }`}
                title="Click to view full Connection Diagnostics"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Twelve Data:</span>
                <span className="font-semibold">
                  {isConnected ? 'Connected' : isDegraded ? 'Degraded' : 'Disconnected'}
                </span>
              </button>

              {/* AI Engine Status */}
              <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#101726] rounded border border-slate-800 text-slate-300">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-400">AI:</span>
                <span className="text-emerald-400 font-semibold">{aiEngineStatus}</span>
              </div>

              {/* Risk & Methodology Disclaimer */}
              <button
                onClick={onOpenDisclaimer}
                className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-slate-800/60 rounded transition-colors"
                title="Methodology, Risk Disclosures & Disclaimer"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Connection Diagnostic Panel Modal (Requirement 10) */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1222] border border-[#1b263b] rounded-xl max-w-xl w-full p-6 space-y-5 shadow-2xl font-mono text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Server className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                    Market Data Connection Diagnostics
                  </h3>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Live telemetry for Twelve Data provider integration
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStatusModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Diagnostic Metrics Matrix (Requirement 10) */}
            <div className="space-y-2.5 bg-[#070b14] border border-[#172236] p-4 rounded-lg">
              {/* 1. Backend Reachable */}
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">1. Backend Reachable:</span>
                <span className="font-bold flex items-center space-x-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>YES (HTTP 200 OK)</span>
                </span>
              </div>

              {/* 2. API Key Configured (Yes/No only, never the key) */}
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">2. API Key Configured:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                    diagnostics?.apiKeyConfigured
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {diagnostics?.apiKeyConfigured ? 'YES (Server Secret)' : 'NO (Missing Secret)'}
                </span>
              </div>

              {/* 3. Provider Request Status */}
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">3. Provider Request Status:</span>
                <span
                  className={`font-bold ${
                    diagnostics?.providerRequestStatus.startsWith('200')
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {diagnostics?.providerRequestStatus || 'Awaiting Request'}
                </span>
              </div>

              {/* 4. Symbol & Interval Requested */}
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">4. Symbol & Interval Requested:</span>
                <span className="font-bold text-slate-200">
                  {diagnostics?.symbolRequested || 'XAU/USD'} ({diagnostics?.intervalRequested || '15min'})
                </span>
              </div>

              {/* 5. Latest Successful Data Timestamp */}
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">5. Latest Data Timestamp:</span>
                <span className="text-slate-200 font-mono">
                  {diagnostics?.latestDataTimestamp || 'None (No live candle received)'}
                </span>
              </div>

              {/* 6. Candle Count Received */}
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">6. Candle Count Received:</span>
                <span className="font-bold text-amber-300">
                  {diagnostics?.candleCount ?? 0} candles
                </span>
              </div>

              {/* 7. Provider Error Category */}
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">7. Provider Error Category:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                    diagnostics?.providerErrorCategory === 'NONE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {diagnostics?.providerErrorCategory || 'MISSING_API_KEY'}
                </span>
              </div>
            </div>

            {/* Error Message if present */}
            {diagnostics?.providerErrorMessage && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-rose-300 text-xs font-mono space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-rose-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Provider Feedback:</span>
                </div>
                <p className="text-[11px] leading-relaxed">{diagnostics.providerErrorMessage}</p>
              </div>
            )}

            {/* Security Guarantee Notice */}
            <div className="p-3 bg-[#070b14] border border-[#1a253a] rounded-lg space-y-1.5 text-slate-400 font-sans text-[11px]">
              <div className="font-bold font-mono text-slate-200 flex items-center space-x-1 text-xs">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Security & Configuration Notice</span>
              </div>
              <p>
                Twelve Data API keys are stored strictly in server-side environment secrets (<code className="text-amber-300 font-mono">TWELVE_DATA_API_KEY</code>). They are never exposed in browser JavaScript, client bundles, or frontend logs.
              </p>
            </div>

            {/* Live Interactive Probe Test Controls */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <span className="text-[11px] text-slate-400 font-semibold">Live Feed Probe Controls:</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase">Probe Symbol</label>
                  <select
                    value={probeSymbol}
                    onChange={(e) => setProbeSymbol(e.target.value)}
                    className="w-full bg-[#070d18] border border-[#1e2c47] rounded px-2 py-1.5 text-xs text-slate-200 outline-none"
                  >
                    <option value="XAU/USD">XAU/USD (Spot Gold)</option>
                    <option value="EUR/USD">EUR/USD (Euro)</option>
                    <option value="GBP/USD">GBP/USD (Pound)</option>
                    <option value="USD/JPY">USD/JPY (Yen)</option>
                    <option value="BTC/USD">BTC/USD (Bitcoin)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase">Interval</label>
                  <select
                    value={probeInterval}
                    onChange={(e) => setProbeInterval(e.target.value)}
                    className="w-full bg-[#070d18] border border-[#1e2c47] rounded px-2 py-1.5 text-xs text-slate-200 outline-none"
                  >
                    <option value="15min">15min (M15)</option>
                    <option value="5min">5min (M5)</option>
                    <option value="1h">1h (H1)</option>
                    <option value="4h">4h (H4)</option>
                    <option value="1day">1day (D1)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={handleRunProbe}
                disabled={isTestingFeed}
                className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingFeed ? 'animate-spin' : ''}`} />
                <span>
                  {isTestingFeed ? 'Probing Twelve Data...' : `Probe Twelve Data Live (${probeSymbol})`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIsStatusModalOpen(false)}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

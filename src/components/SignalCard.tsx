import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  PauseCircle,
  ShieldAlert,
  CheckCircle2,
  BookmarkCheck,
  Calculator,
  Info,
  Layers,
  Target,
  ArrowRight,
  Flame,
  Award,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import { SignalAnalysisResult } from '../types/trading.ts';
import { INSTRUMENT_SPECS } from '../utils/trading-math.ts';

interface SignalCardProps {
  result: SignalAnalysisResult;
  onSaveToJournal: (notes: string) => void;
  onOpenCalculatorForTrade: (entry: number, sl: number, symbol: string) => void;
  isSaved?: boolean;
}

export const SignalCard: React.FC<SignalCardProps> = ({
  result,
  onSaveToJournal,
  onOpenCalculatorForTrade,
  isSaved = false,
}) => {
  const [userNotes, setUserNotes] = useState('');
  const [showNotesInput, setShowNotesInput] = useState(false);

  const {
    decision,
    confidenceScore,
    confidenceBreakdown,
    setupStatus,
    instrument,
    timeframe,
    detectedCurrentPrice,
    trendDirection,
    marketStructure,
    bosChochAnalysis,
    liquidityAnalysis,
    supportResistance,
    orderBlock,
    fairValueGap,
    visibleIndicators,
    tradePlan,
    entryConfirmation,
    invalidationConditions,
    decisionRationale,
    limitations,
  } = result;

  const spec = INSTRUMENT_SPECS[instrument] || { precision: 2, pipSize: 0.1 };
  const formatPrice = (val?: number | null) => {
    if (val === undefined || val === null) return '--';
    return val > 1000 ? val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: spec.precision }) : val.toFixed(spec.precision);
  };

  const getDecisionTheme = () => {
    if (decision === 'BUY') {
      return {
        bg: 'from-emerald-950/70 via-[#0a1815] to-[#0a121d]',
        border: 'border-emerald-500/50',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        glow: 'shadow-emerald-500/10',
        icon: TrendingUp,
        label: 'BUY ORDER FLOW CONFIRMED',
        actionColor: 'text-emerald-400',
      };
    }
    if (decision === 'SELL') {
      return {
        bg: 'from-rose-950/70 via-[#180a0f] to-[#0a121d]',
        border: 'border-rose-500/50',
        badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        glow: 'shadow-rose-500/10',
        icon: TrendingDown,
        label: 'SELL ORDER FLOW CONFIRMED',
        actionColor: 'text-rose-400',
      };
    }
    return {
      bg: 'from-amber-950/70 via-[#19130a] to-[#0a121d]',
      border: 'border-amber-500/50',
      badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      glow: 'shadow-amber-500/10',
      icon: PauseCircle,
      label: 'WAIT / CONFLICTING EVIDENCE',
      actionColor: 'text-amber-400',
    };
  };

  const theme = getDecisionTheme();
  const DecisionIcon = theme.icon;

  const handleSave = () => {
    onSaveToJournal(userNotes);
    setShowNotesInput(false);
  };

  return (
    <div className={`rounded-xl border ${theme.border} bg-gradient-to-b ${theme.bg} shadow-2xl ${theme.glow} overflow-hidden space-y-6 p-6 transition-all`}>
      {/* Top Banner: Signal, Status & Quality Score */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${theme.badgeBg} shadow-lg shrink-0`}>
            <DecisionIcon className={`w-8 h-8 ${theme.actionColor}`} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-mono ${theme.actionColor}`}>
                {decision}
              </span>
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono border ${theme.badgeBg}`}>
                {setupStatus}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800/90 text-slate-300 border border-slate-700">
                {instrument} &bull; {timeframe}
              </span>
            </div>

            <p className="text-xs text-slate-300 mt-1 font-mono">
              Market Stance: <span className="text-slate-100 font-semibold">{trendDirection}</span> &bull; Current:{' '}
              <span className="text-amber-300 font-bold">{formatPrice(detectedCurrentPrice)}</span>
            </p>
          </div>
        </div>

        {/* Confidence Score Pill & Breakdown */}
        <div className="bg-[#070b16] rounded-xl p-3 border border-slate-800 flex items-center space-x-5 lg:min-w-[320px]">
          <div className="text-center pl-2">
            <div className="text-[10px] uppercase font-mono text-slate-400">Quality Score</div>
            <div className="flex items-baseline justify-center space-x-1">
              <span className={`text-2xl font-black font-mono ${
                confidenceScore >= 80 ? 'text-emerald-400' : confidenceScore >= 60 ? 'text-amber-400' : 'text-slate-400'
              }`}>
                {confidenceScore}
              </span>
              <span className="text-xs text-slate-500 font-mono">/100</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
              Grade {confidenceScore >= 85 ? 'A+' : confidenceScore >= 75 ? 'A' : confidenceScore >= 60 ? 'B' : 'C'}
            </div>
          </div>

          {/* Mini Factor Progress Bars */}
          <div className="flex-1 space-y-1 text-[10px] font-mono border-l border-slate-800 pl-4">
            <div className="flex justify-between text-slate-400">
              <span>Trend / Struct</span>
              <span className="text-slate-200">
                {confidenceBreakdown.trendAlignment + confidenceBreakdown.marketStructure}/40
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full"
                style={{ width: `${((confidenceBreakdown.trendAlignment + confidenceBreakdown.marketStructure) / 40) * 100}%` }}
              />
            </div>

            <div className="flex justify-between text-slate-400 pt-0.5">
              <span>Liquidity / Sweep</span>
              <span className="text-slate-200">{confidenceBreakdown.liquidityConfirmation}/20</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full"
                style={{ width: `${(confidenceBreakdown.liquidityConfirmation / 20) * 100}%` }}
              />
            </div>

            <div className="flex justify-between text-slate-400 pt-0.5">
              <span>Trigger & R:R</span>
              <span className="text-slate-200">
                {confidenceBreakdown.entryTrigger + confidenceBreakdown.riskReward}/30
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Plan Price Ladder (When decision is BUY or SELL) */}
      {tradePlan && decision !== 'WAIT' ? (
        <div className="bg-[#090f1d] rounded-xl border border-[#1a2742] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold font-mono tracking-wider text-slate-200 uppercase">
                INSTITUTIONAL EXECUTION LEVELS
              </h3>
            </div>
            <button
              onClick={() => onOpenCalculatorForTrade(tradePlan.entryZone.optimal, tradePlan.stopLoss, instrument)}
              className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center space-x-1.5 transition-colors"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Calculate Position Size</span>
            </button>
          </div>

          {/* 4 Key Level Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Entry */}
            <div className="p-3 bg-[#0c1424] rounded-lg border border-sky-500/30">
              <span className="text-[10px] font-mono font-bold text-sky-400 uppercase block">
                ENTRY ZONE (OPTIMAL)
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-slate-100 block mt-1">
                {formatPrice(tradePlan.entryZone.optimal)}
              </span>
              <span className="text-[10px] font-mono text-slate-400 block mt-0.5 truncate">
                Zone: {formatPrice(tradePlan.entryZone.min)} - {formatPrice(tradePlan.entryZone.max)}
              </span>
            </div>

            {/* Stop Loss */}
            <div className="p-3 bg-[#180d15] rounded-lg border border-rose-500/40">
              <span className="text-[10px] font-mono font-bold text-rose-400 uppercase block">
                STOP LOSS (SL)
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-rose-300 block mt-1">
                {formatPrice(tradePlan.stopLoss)}
              </span>
              <span className="text-[10px] font-mono text-rose-400/80 block mt-0.5">
                Risk: {tradePlan.stopDistancePips} pips
              </span>
            </div>

            {/* TP1 */}
            <div className="p-3 bg-[#0d1a19] rounded-lg border border-emerald-500/30">
              <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase block">
                TAKE PROFIT 1 (TP1)
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-emerald-300 block mt-1">
                {formatPrice(tradePlan.takeProfit1)}
              </span>
              <span className="text-[10px] font-mono text-emerald-400/90 block mt-0.5">
                R:R: 1:{tradePlan.riskRewardRatioTP1}
              </span>
            </div>

            {/* TP2 */}
            <div className="p-3 bg-[#0d1a19] rounded-lg border border-emerald-500/50">
              <span className="text-[10px] font-mono font-bold text-emerald-300 uppercase block">
                TAKE PROFIT 2 (TP2)
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-emerald-200 block mt-1">
                {formatPrice(tradePlan.takeProfit2)}
              </span>
              <span className="text-[10px] font-mono text-emerald-300/90 block mt-0.5">
                R:R: 1:{tradePlan.riskRewardRatioTP2} (HTF Target)
              </span>
            </div>
          </div>

          {/* Visual Risk to Reward Gauge */}
          <div className="bg-[#050811] p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1.5">
              <span>Risk: 1.0R ({tradePlan.stopDistancePips} pips)</span>
              <span className="text-emerald-400 font-semibold">
                Target TP1: 1:{tradePlan.riskRewardRatioTP1} &bull; Target TP2: 1:{tradePlan.riskRewardRatioTP2}
              </span>
            </div>
            <div className="h-3 w-full bg-slate-900 rounded-full flex overflow-hidden border border-slate-800">
              <div className="bg-rose-500/80 w-[25%] flex items-center justify-center text-[9px] font-bold text-white font-mono">
                RISK 1R
              </div>
              <div className="bg-emerald-600/70 w-[35%] border-l border-slate-900 flex items-center justify-center text-[9px] font-bold text-white font-mono">
                TP1 ({tradePlan.riskRewardRatioTP1}R)
              </div>
              <div className="bg-emerald-500 w-[40%] border-l border-slate-900 flex items-center justify-center text-[9px] font-bold text-slate-950 font-mono">
                TP2 ({tradePlan.riskRewardRatioTP2}R)
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* WAIT Reason Box */
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 text-xs font-mono text-amber-200/90 space-y-2">
          <div className="flex items-center space-x-2 text-amber-400 font-bold">
            <Info className="w-4 h-4" />
            <span>WAIT DECISION RATIONALE: CAPITAL PRESERVATION</span>
          </div>
          <p className="leading-relaxed">
            Market conditions do not currently provide a high-probability edge. Evidence shows either consolidating range, conflicting timeframe momentum, or unverified liquidity sweeps. Avoid forcing trades in low-probability environments.
          </p>
        </div>
      )}

      {/* SMC & Market Structure Analysis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Market Structure & BOS/CHOCH */}
        <div className="bg-[#090f1d] p-4 rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex items-center space-x-2 text-amber-400 font-mono font-bold uppercase">
            <Layers className="w-4 h-4" />
            <span>Market Structure & Break of Structure</span>
          </div>
          <p className="text-slate-300 leading-relaxed">{marketStructure}</p>
          <div className="pt-2 border-t border-slate-800/80">
            <span className="font-semibold text-slate-200 font-mono">BOS / CHOCH:</span>
            <p className="text-slate-400 mt-0.5">{bosChochAnalysis}</p>
          </div>
        </div>

        {/* Liquidity Profile & Sweeps */}
        <div className="bg-[#090f1d] p-4 rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex items-center space-x-2 text-amber-400 font-mono font-bold uppercase">
            <Zap className="w-4 h-4" />
            <span>Liquidity Pools & Sweeps</span>
          </div>
          <p className="text-slate-300 leading-relaxed">{liquidityAnalysis}</p>
          <div className="pt-2 border-t border-slate-800/80">
            <span className="font-semibold text-slate-200 font-mono">Visible Indicators:</span>
            <p className="text-slate-400 mt-0.5">{visibleIndicators}</p>
          </div>
        </div>

        {/* Order Block & FVG Zone Details */}
        <div className="bg-[#090f1d] p-4 rounded-xl border border-slate-800 space-y-2">
          <span className="text-amber-400 font-mono font-bold uppercase block">
            Institutional Order Block (OB)
          </span>
          {orderBlock.detected ? (
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                  orderBlock.type === 'Bullish' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {orderBlock.type} OB
                </span>
                <span className="font-mono text-slate-200">
                  {formatPrice(orderBlock.zoneMin)} - {formatPrice(orderBlock.zoneMax)}
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">{orderBlock.notes}</p>
            </div>
          ) : (
            <p className="text-slate-500 text-[11px] font-mono">No distinct Order Block clearly detected in visible range.</p>
          )}
        </div>

        {/* Fair Value Gap (FVG) */}
        <div className="bg-[#090f1d] p-4 rounded-xl border border-slate-800 space-y-2">
          <span className="text-amber-400 font-mono font-bold uppercase block">
            Fair Value Gap / Imbalance (FVG)
          </span>
          {fairValueGap.detected ? (
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {fairValueGap.status} FVG
                </span>
                <span className="font-mono text-slate-200">
                  {formatPrice(fairValueGap.zoneMin)} - {formatPrice(fairValueGap.zoneMax)}
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">{fairValueGap.notes}</p>
            </div>
          ) : (
            <p className="text-slate-500 text-[11px] font-mono">No significant imbalance or FVG identified.</p>
          )}
        </div>
      </div>

      {/* Entry Confirmations & Invalidation Checklists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
        {/* Entry Confirmations */}
        <div className="bg-[#070b16] p-4 rounded-xl border border-emerald-900/30 space-y-2.5">
          <div className="flex items-center space-x-2 text-emerald-400 font-bold uppercase">
            <CheckCircle2 className="w-4 h-4" />
            <span>Required Entry Confirmation Triggers</span>
          </div>
          <ul className="space-y-1.5 text-slate-300">
            {entryConfirmation.map((item, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-emerald-400 font-bold">&bull;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Invalidation Conditions */}
        <div className="bg-[#070b16] p-4 rounded-xl border border-rose-900/30 space-y-2.5">
          <div className="flex items-center space-x-2 text-rose-400 font-bold uppercase">
            <ShieldAlert className="w-4 h-4" />
            <span>Setup Invalidation Criteria</span>
          </div>
          <ul className="space-y-1.5 text-slate-300">
            {invalidationConditions.map((item, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-rose-400 font-bold">&bull;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Decision Rationale & Limitations */}
      <div className="space-y-3 bg-[#080d19] p-4 rounded-xl border border-slate-800 text-xs">
        <div>
          <span className="font-mono font-bold text-slate-200 uppercase tracking-wider block mb-1">
            Supporting Evidence Rationale
          </span>
          <ul className="space-y-1 text-slate-400">
            {decisionRationale.map((r, i) => (
              <li key={i} className="flex items-start space-x-2">
                <span className="text-amber-400 font-bold">&rarr;</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {limitations.length > 0 && (
          <div className="pt-2 border-t border-slate-800">
            <span className="font-mono font-bold text-amber-400 uppercase tracking-wider block mb-1">
              Limitations & Data Boundary Notice
            </span>
            <ul className="space-y-1 text-slate-400 text-[11px]">
              {limitations.map((lim, i) => (
                <li key={i} className="flex items-start space-x-2">
                  <span className="text-amber-500 font-mono">&bull;</span>
                  <span>{lim}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Save to Trade Journal CTA */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-400 font-mono flex items-center space-x-2">
          <Info className="w-4 h-4 text-slate-500" />
          <span>Save this analysis to the Trade Journal to track execution and outcome.</span>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {!showNotesInput ? (
            <button
              onClick={() => setShowNotesInput(true)}
              disabled={isSaved}
              className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center space-x-1.5 ${
                isSaved
                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/40 cursor-default'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/10'
              }`}
            >
              <BookmarkCheck className="w-4 h-4" />
              <span>{isSaved ? 'SAVED TO JOURNAL' : 'SAVE TO TRADE JOURNAL'}</span>
            </button>
          ) : (
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Optional notes (e.g. London Open, Waiting 15m candle close)..."
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                className="bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-500 flex-1 sm:w-64"
              />
              <button
                onClick={handleSave}
                className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-xs font-bold"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowNotesInput(false)}
                className="px-2 py-1.5 text-slate-400 hover:text-slate-200 text-xs font-mono"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

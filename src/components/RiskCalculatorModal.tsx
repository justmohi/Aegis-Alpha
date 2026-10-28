import React, { useState, useEffect } from 'react';
import {
  Calculator,
  ShieldCheck,
  AlertTriangle,
  Info,
  DollarSign,
  Percent,
  Sliders,
  CheckCircle,
} from 'lucide-react';
import { calculatePositionSize, INSTRUMENT_SPECS, PositionSizeResult } from '../utils/trading-math.ts';

interface RiskCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSymbol?: string;
  initialEntry?: number;
  initialStopLoss?: number;
  isEmbedded?: boolean;
}

export const RiskCalculatorModal: React.FC<RiskCalculatorModalProps> = ({
  isOpen,
  onClose,
  initialSymbol = 'EURUSD',
  initialEntry,
  initialStopLoss,
  isEmbedded = false,
}) => {
  const [accountEquity, setAccountEquity] = useState<number>(50000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [maxRiskCap, setMaxRiskCap] = useState<number>(1000);
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [entryPrice, setEntryPrice] = useState<number>(initialEntry || 1.0850);
  const [stopLossPrice, setStopLossPrice] = useState<number>(initialStopLoss || 1.0825);
  const [dailyLossLimit, setDailyLossLimit] = useState<number>(3.0); // 3%
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState<number>(3);

  // When initial props change
  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
    if (initialEntry) setEntryPrice(initialEntry);
    if (initialStopLoss) setStopLossPrice(initialStopLoss);
  }, [initialSymbol, initialEntry, initialStopLoss]);

  const spec = INSTRUMENT_SPECS[symbol] || INSTRUMENT_SPECS.EURUSD;

  // Calculate position sizing
  const result: PositionSizeResult = calculatePositionSize({
    accountEquity,
    riskPercentage: riskPercent,
    symbol,
    entryPrice,
    stopLossPrice,
    maxRiskLimitUSD: maxRiskCap,
  });

  if (!isOpen) return null;

  const content = (
    <div className={`bg-[#0b101e] rounded-xl border border-slate-800 ${isEmbedded ? 'w-full' : 'max-w-2xl w-full max-h-[90vh] overflow-y-auto'} p-6 space-y-6 shadow-2xl`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="p-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Calculator className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold font-mono tracking-wider text-slate-100 uppercase">
              INSTITUTIONAL RISK & POSITION SIZING MATRIX
            </h2>
            <p className="text-xs text-slate-400">
              Mathematical lot calculation based on contract specifications & capital preservation rules.
            </p>
          </div>
        </div>
        {!isEmbedded && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-mono text-base px-2 py-1 rounded"
          >
            &times;
          </button>
        )}
      </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          {/* Account Equity */}
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold block">ACCOUNT EQUITY ($ USD)</label>
            <input
              type="number"
              value={accountEquity}
              onChange={(e) => setAccountEquity(Number(e.target.value))}
              className="w-full bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-2 text-xs"
            />
          </div>

          {/* Risk Percentage */}
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold block">RISK PER TRADE (%)</label>
            <div className="flex items-center space-x-2">
              {[0.5, 1.0, 1.5, 2.0].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setRiskPercent(pct)}
                  className={`px-2.5 py-1.5 rounded text-xs transition-colors ${
                    riskPercent === pct
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {pct}%
                </button>
              ))}
              <input
                type="number"
                step="0.1"
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value))}
                className="w-20 bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-2 py-1.5 text-xs text-center"
              />
            </div>
          </div>

          {/* Instrument */}
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold block">INSTRUMENT / ASSET</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-2 text-xs"
            >
              {Object.keys(INSTRUMENT_SPECS).map((sym) => (
                <option key={sym} value={sym}>
                  {sym} - {INSTRUMENT_SPECS[sym].name}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500 block">
              Contract: {spec.contractSize.toLocaleString()} units &bull; Pip: {spec.pipSize}
            </span>
          </div>

          {/* Max Risk Cap */}
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold block">MAX RISK CAP ($ USD)</label>
            <input
              type="number"
              value={maxRiskCap}
              onChange={(e) => setMaxRiskCap(Number(e.target.value))}
              className="w-full bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-2 text-xs"
            />
            <span className="text-[10px] text-slate-500 block">Hard dollar stop limit per order</span>
          </div>

          {/* Entry Price */}
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold block">ENTRY PRICE</label>
            <input
              type="number"
              step="any"
              value={entryPrice}
              onChange={(e) => setEntryPrice(Number(e.target.value))}
              className="w-full bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-2 text-xs"
            />
          </div>

          {/* Stop Loss Price */}
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold block">STOP LOSS PRICE</label>
            <input
              type="number"
              step="any"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(Number(e.target.value))}
              className="w-full bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-2 text-xs"
            />
          </div>
        </div>

        {/* Output Calculation Results Box */}
        <div className="bg-[#080d19] rounded-xl border border-amber-500/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono text-amber-300 uppercase tracking-wider">
              MATHEMATICAL SIZING SPECIFICATIONS
            </span>
            {result.maxDrawdownLimitHit && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
                Max Dollar Cap Enforced
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
            {/* Recommended Lot Size */}
            <div className="p-3 bg-[#0f172a] rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block uppercase">Recommended Size</span>
              <span className="text-2xl font-black text-amber-400 block mt-1">
                {result.lotSize}{' '}
                <span className="text-xs font-normal text-slate-400">
                  {spec.assetClass === 'Crypto' ? 'Units' : spec.assetClass === 'Metals' ? 'Lots (Oz)' : 'Std Lots'}
                </span>
              </span>
              <span className="text-[10px] text-slate-500">
                {(result.lotSize * 10).toFixed(0)} Mini / {(result.lotSize * 100).toFixed(0)} Micro
              </span>
            </div>

            {/* Total Monetary Risk */}
            <div className="p-3 bg-[#0f172a] rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block uppercase">Risk Amount ($)</span>
              <span className="text-2xl font-black text-rose-400 block mt-1">
                ${result.riskAmountUSD.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500">
                {((result.riskAmountUSD / accountEquity) * 100).toFixed(2)}% of equity
              </span>
            </div>

            {/* Stop Distance in Pips */}
            <div className="p-3 bg-[#0f172a] rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block uppercase">Stop Distance</span>
              <span className="text-2xl font-black text-sky-400 block mt-1">
                {result.stopDistancePips}{' '}
                <span className="text-xs font-normal text-slate-400">pips</span>
              </span>
              <span className="text-[10px] text-slate-500">
                ${result.pipValueUSD}/pip sensitivity
              </span>
            </div>

            {/* Total Notional Position Value */}
            <div className="p-3 bg-[#0f172a] rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block uppercase">Notional Value</span>
              <span className="text-lg font-bold text-slate-100 block mt-1">
                ${result.positionNotionalUSD.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500">Full contract exposure</span>
            </div>

            {/* Estimated Margin (at 1:30 leverage) */}
            <div className="p-3 bg-[#0f172a] rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block uppercase">Req. Margin (1:30)</span>
              <span className="text-lg font-bold text-slate-200 block mt-1">
                ${(result.positionNotionalUSD / 30).toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500">Retail regulatory tier</span>
            </div>

            {/* Circuit Breaker Daily Limit */}
            <div className="p-3 bg-[#0f172a] rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block uppercase">Daily Loss Limit</span>
              <span className="text-lg font-bold text-rose-300 block mt-1">
                -${((accountEquity * dailyLossLimit) / 100).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500">
                Halt trading if reached ({dailyLossLimit}%)
              </span>
            </div>
          </div>
        </div>

        {/* Institutional Safeguards Footer */}
        <div className="p-3.5 bg-[#070b16] rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
          <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>PORTFOLIO RISK CONTROL POLICIES:</span>
          </div>
          <p>
            &bull; Maximum concurrent exposure limited to {maxConcurrentPositions} uncorrelated setups.
          </p>
          <p>
            &bull; Mandatory circuit breaker: halt all trading for the session if {dailyLossLimit}% equity loss or 2 consecutive losses occur.
          </p>
          <p>
            &bull; Notice: Aegis Alpha is an analytical terminal. It does not place live broker orders or custody client funds.
          </p>
        </div>
      </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {content}
    </div>
  );
};

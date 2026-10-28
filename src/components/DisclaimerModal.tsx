import React from 'react';
import { ShieldAlert, BookOpen, CheckCircle, Scale, AlertOctagon } from 'lucide-react';

interface DisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b101e] rounded-xl border border-slate-800 max-w-2xl w-full p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[85vh] text-xs font-mono text-slate-300">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2 text-amber-400">
            <Scale className="w-5 h-5" />
            <h2 className="text-sm font-bold tracking-wider uppercase text-slate-100">
              METHODOLOGY, DISCLOSURES & RISK POLICY
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-mono text-base px-2 py-1 rounded"
          >
            &times;
          </button>
        </div>

        {/* Core Principles */}
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-200">
            <div className="flex items-center space-x-2 text-rose-400 font-bold mb-1">
              <AlertOctagon className="w-4 h-4" />
              <span>CAPITAL RISK & NO PROFIT GUARANTEES</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              Trading leveraged financial instruments (foreign exchange, spot commodities, equities, and cryptocurrency derivatives) carries a high degree of risk and can result in the loss of your entire capital. Aegis Alpha does not provide investment advice or guarantee trading profitability.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-amber-400 uppercase mb-1.5 flex items-center space-x-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Smart Money Concepts (SMC) Analytical Architecture</span>
            </h3>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              The terminal inspects visible chart price action using institutional Smart Money Concepts:
            </p>
            <ul className="list-disc list-inside mt-1.5 space-y-1 text-slate-300 text-[11px]">
              <li><strong>Market Structure:</strong> Tracks Higher Highs (HH) and Higher Lows (HL) for bullish flow, or Lower Highs (LH) and Lower Lows (LL) for bearish trend validation.</li>
              <li><strong>BOS vs CHOCH:</strong> Break of Structure indicates trend continuation; Change of Character flags potential structural exhaustion or trend reversal.</li>
              <li><strong>Liquidity Sweeps:</strong> Detects stop-runs above swing highs (BSL) or below swing lows (SSL) before displacement occurs.</li>
              <li><strong>Order Blocks & FVGs:</strong> Identifies unmitigated supply/demand zones and Fair Value Gaps (3-candle imbalances) for discount/premium entries.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-amber-400 uppercase mb-1.5 flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Confidence Score Methodology</span>
            </h3>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              The Setup Quality Score (0 to 100) reflects the technical confluence of available evidence, <strong>not</strong> an empirical probability of a winning trade. It is calculated from 6 weighted factors: Trend Alignment (20 pts), Market Structure (20 pts), Liquidity Confirmation (20 pts), Entry Trigger (15 pts), Risk/Reward Ratio (15 pts), and Visual Data Clarity (10 pts). Missing or ambiguous data strictly lowers the score.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-amber-400 uppercase mb-1.5">
              Strict Broker Order Independence
            </h3>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Aegis Alpha does not connect to brokerage APIs, does not place real orders, and does not custody funds. All trade plans and position sizes are calculated strictly for user evaluation and simulation purposes.
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-xs transition-colors"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};

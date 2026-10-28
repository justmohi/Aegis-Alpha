import React, { useState } from 'react';
import {
  BookOpen,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Edit3,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  PauseCircle,
  AlertTriangle,
} from 'lucide-react';
import { JournalEntry, TradeOutcome } from '../types/trading.ts';

interface TradeJournalProps {
  entries: JournalEntry[];
  onUpdateOutcome: (id: string, outcome: TradeOutcome, realizedR?: number, userNotes?: string) => void;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
}

export const TradeJournal: React.FC<TradeJournalProps> = ({
  entries,
  onUpdateOutcome,
  onDeleteEntry,
  onClearAll,
}) => {
  const [filterSymbol, setFilterSymbol] = useState('ALL');
  const [filterOutcome, setFilterOutcome] = useState('ALL');
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  // Outcome edit modal state
  const [outcomeSelect, setOutcomeSelect] = useState<TradeOutcome>('PENDING');
  const [realizedRInput, setRealizedRInput] = useState<string>('0');
  const [notesInput, setNotesInput] = useState('');

  // Performance calculations on closed trades
  const closedTrades = entries.filter((e) => e.outcome !== 'PENDING' && e.outcome !== 'INVALIDATED');
  const winningTrades = closedTrades.filter((e) => e.outcome === 'HIT_TP1' || e.outcome === 'HIT_TP2');
  const winRate = closedTrades.length > 0 ? Math.round((winningTrades.length / closedTrades.length) * 100) : 0;
  const totalR = closedTrades.reduce((acc, e) => acc + (e.realizedR || 0), 0);

  // Filtered entries
  const filteredEntries = entries.filter((e) => {
    if (filterSymbol !== 'ALL' && e.instrument !== filterSymbol) return false;
    if (filterOutcome !== 'ALL' && e.outcome !== filterOutcome) return false;
    return true;
  });

  const handleOpenEdit = (entry: JournalEntry) => {
    setSelectedEntry(entry);
    setOutcomeSelect(entry.outcome);
    setRealizedRInput(String(entry.realizedR || 0));
    setNotesInput(entry.userNotes || '');
  };

  const handleSaveOutcome = () => {
    if (!selectedEntry) return;
    onUpdateOutcome(
      selectedEntry.id,
      outcomeSelect,
      parseFloat(realizedRInput) || 0,
      notesInput
    );
    setSelectedEntry(null);
  };

  const exportToJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(entries, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `aegis_trade_journal_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="bg-[#0b101d] rounded-xl border border-[#182338] shadow-2xl overflow-hidden space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <BookOpen className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-bold font-mono tracking-wider text-slate-100 uppercase">
              INSTITUTIONAL TRADE JOURNAL & AUDIT LOG
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Track recorded AI trade setups, verify eventual outcomes, and audit forward performance without bias.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {entries.length > 0 && (
            <>
              <button
                onClick={exportToJson}
                className="px-3 py-1.5 rounded text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center space-x-1"
                title="Export Journal to JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
              <button
                onClick={onClearAll}
                className="px-3 py-1.5 rounded text-xs font-mono bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-[#080d19] rounded-lg border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Total Recorded</span>
          <span className="text-xl font-bold font-mono text-slate-100 block mt-1">{entries.length}</span>
          <span className="text-[10px] font-mono text-slate-500">
            {entries.filter((e) => e.outcome === 'PENDING').length} Open / Pending
          </span>
        </div>

        <div className="p-3 bg-[#080d19] rounded-lg border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Realized Win Rate</span>
          <span className="text-xl font-bold font-mono text-emerald-400 block mt-1">
            {closedTrades.length > 0 ? `${winRate}%` : '--'}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {closedTrades.length > 0 ? `${winningTrades.length}W of ${closedTrades.length} Closed` : 'Awaiting closed trades'}
          </span>
        </div>

        <div className="p-3 bg-[#080d19] rounded-lg border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Net Realized R</span>
          <span className={`text-xl font-bold font-mono block mt-1 ${totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalR >= 0 ? `+${totalR.toFixed(1)}R` : `${totalR.toFixed(1)}R`}
          </span>
          <span className="text-[10px] font-mono text-slate-500">Cumulative risk units</span>
        </div>

        <div className="p-3 bg-[#080d19] rounded-lg border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Closed Sample</span>
          <span className="text-xl font-bold font-mono text-amber-300 block mt-1">{closedTrades.length}</span>
          <span className="text-[10px] font-mono text-slate-500">Audited executions</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#080d19] p-3 rounded-lg border border-slate-800 text-xs font-mono">
        <div className="flex items-center space-x-3">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Filter Asset:</span>
            <select
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              className="bg-[#101726] border border-[#1f2d48] text-slate-200 rounded px-2 py-1 text-xs"
            >
              <option value="ALL">All Symbols</option>
              <option value="EURUSD">EUR/USD</option>
              <option value="GBPUSD">GBP/USD</option>
              <option value="USDJPY">USD/JPY</option>
              <option value="XAUUSD">XAU/USD</option>
              <option value="BTCUSD">BTC/USD</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Outcome:</span>
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="bg-[#101726] border border-[#1f2d48] text-slate-200 rounded px-2 py-1 text-xs"
            >
              <option value="ALL">All Outcomes</option>
              <option value="PENDING">Pending</option>
              <option value="HIT_TP1">Hit TP1</option>
              <option value="HIT_TP2">Hit TP2</option>
              <option value="STOPPED_OUT">Stopped Out</option>
              <option value="INVALIDATED">Invalidated</option>
            </select>
          </div>
        </div>

        <span className="text-slate-500 text-[11px]">
          Showing {filteredEntries.length} of {entries.length} records
        </span>
      </div>

      {/* Journal Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-xl p-10 text-center bg-[#070b16]/60">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs font-mono text-slate-400">
            {entries.length === 0
              ? 'Your Trade Journal is currently empty. Run an analysis on the Terminal tab and click "Save to Trade Journal" to record setups.'
              : 'No entries match your current filter selection.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="bg-[#080d19] rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="flex items-start space-x-3.5">
                {/* Decision Badge */}
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold font-mono text-xs shrink-0 border ${
                    entry.decision === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : entry.decision === 'SELL'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  }`}
                >
                  {entry.decision}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold font-mono text-slate-100">{entry.instrument}</span>
                    <span className="text-xs font-mono text-slate-400">({entry.timeframe})</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      Score: {entry.confidenceScore}/100
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        entry.outcome === 'HIT_TP1' || entry.outcome === 'HIT_TP2'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : entry.outcome === 'STOPPED_OUT'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : entry.outcome === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {entry.outcome} {entry.realizedR !== undefined && entry.realizedR !== 0 ? `(${entry.realizedR > 0 ? `+${entry.realizedR}` : entry.realizedR}R)` : ''}
                    </span>
                  </div>

                  {entry.tradePlan && (
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 mt-1">
                      <span>Entry: <strong className="text-slate-200">{entry.tradePlan.entryZone.optimal}</strong></span>
                      <span>SL: <strong className="text-rose-400">{entry.tradePlan.stopLoss}</strong></span>
                      <span>TP1: <strong className="text-emerald-400">{entry.tradePlan.takeProfit1}</strong></span>
                      <span>TP2: <strong className="text-emerald-400">{entry.tradePlan.takeProfit2}</strong></span>
                    </div>
                  )}

                  {entry.userNotes && (
                    <p className="text-xs text-slate-300 italic mt-1.5 bg-[#0e1627] p-1.5 rounded border border-slate-800/80">
                      &ldquo;{entry.userNotes}&rdquo;
                    </p>
                  )}

                  <span className="text-[10px] text-slate-500 font-mono block mt-1">
                    Logged: {new Date(entry.createdAt).toLocaleString()} &bull; Strategy: {entry.analysisType}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                <button
                  onClick={() => handleOpenEdit(entry)}
                  className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center space-x-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Update Outcome</span>
                </button>
                <button
                  onClick={() => onDeleteEntry(entry.id)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition-colors"
                  title="Delete record"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Outcome Update Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b101e] rounded-xl border border-slate-800 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold font-mono text-slate-100 uppercase">
                Update Trade Outcome: {selectedEntry.instrument}
              </h3>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-slate-400 hover:text-white font-mono text-xs"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Execution Status / Result</label>
                <select
                  value={outcomeSelect}
                  onChange={(e) => setOutcomeSelect(e.target.value as TradeOutcome)}
                  className="w-full bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-2 text-xs"
                >
                  <option value="PENDING">PENDING (Trade Still Active or Unfilled)</option>
                  <option value="HIT_TP1">HIT TP1 (First Target Hit)</option>
                  <option value="HIT_TP2">HIT TP2 (Full Target Hit)</option>
                  <option value="STOPPED_OUT">STOPPED OUT (Hit Stop Loss)</option>
                  <option value="BREAKEVEN">BREAKEVEN (Exited at Entry)</option>
                  <option value="INVALIDATED">INVALIDATED (Setup Invalidation Triggered)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Realized R-Multiple (e.g. +1.5, +2.8, -1.0)</label>
                <input
                  type="number"
                  step="0.1"
                  value={realizedRInput}
                  onChange={(e) => setRealizedRInput(e.target.value)}
                  className="w-full bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Execution Post-Mortem / Notes</label>
                <textarea
                  rows={3}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Notes on execution, slippage, candle reaction, psychological discipline..."
                  className="w-full bg-[#101726] border border-[#1f2d48] text-slate-100 rounded px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-3 py-1.5 rounded text-xs font-mono text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOutcome}
                className="px-4 py-1.5 rounded text-xs font-mono font-bold bg-amber-500 hover:bg-amber-400 text-slate-950"
              >
                Save Outcome
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

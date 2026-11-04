import React, { useState, useEffect } from 'react';
import { Header, NavTab } from './components/Header.tsx';
import { TickerBar } from './components/TickerBar.tsx';
import { ChartUploader } from './components/ChartUploader.tsx';
import { SignalCard } from './components/SignalCard.tsx';
import { InteractiveChart } from './components/InteractiveChart.tsx';
import { BacktestView } from './components/BacktestView.tsx';
import { TradeJournal } from './components/TradeJournal.tsx';
import { RiskCalculatorModal } from './components/RiskCalculatorModal.tsx';
import { DisclaimerModal } from './components/DisclaimerModal.tsx';
import {
  SignalAnalysisResult,
  JournalEntry,
  TradeOutcome,
  UploadedImage,
  TradingStyle,
  AnalysisType,
} from './types/trading.ts';
import { SAMPLE_CHART_FIXTURES } from './utils/sample-charts.ts';

const JOURNAL_STORAGE_KEY = 'aegis_alpha_trade_journal_v2';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('analyzer');
  const [analysisResult, setAnalysisResult] = useState<SignalAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  const [aiEngineStatus, setAiEngineStatus] = useState('Online');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcPreset, setCalcPreset] = useState<{ entry?: number; sl?: number; symbol?: string }>({});

  // Load journal from localStorage on mount & check server health
  useEffect(() => {
    try {
      const stored = localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (stored) {
        setJournalEntries(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Could not read journal from localStorage', e);
    }

    // Health check
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.aiEngine) {
          setAiEngineStatus(data.aiEngine.includes('Gemini') ? 'Gemini 3.8 Flash' : 'Rule Engine');
        }
      })
      .catch(() => {
        setAiEngineStatus('Local Heuristic');
      });
  }, []);

  // Save journal changes to localStorage
  const saveJournal = (entries: JournalEntry[]) => {
    setJournalEntries(entries);
    try {
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('Could not write journal to localStorage', e);
    }
  };

  // Perform Live Market Analysis (Twelve Data + Deterministic Technical Engine)
  const handleAnalyzeLive = async (params: {
    symbol: string;
    timeframe: string;
    tradingStyle: TradingStyle;
    analysisType: AnalysisType;
    riskRewardTarget: number;
    includeHTF: boolean;
    useEntryRefinement?: boolean;
  }) => {
    setIsAnalyzing(true);
    setAnalysisStep('CONNECTING TO TWELVE DATA MARKET FEED...');

    try {
      setTimeout(() => setAnalysisStep('FETCHING MULTI-TIMEFRAME CANDLES (M15, H1, H4)...'), 400);
      setTimeout(() => setAnalysisStep('CALCULATING ATR, SWINGS, BOS & CHOCH STRUCTURE...'), 900);
      setTimeout(() => setAnalysisStep('DETECTING ORDER BLOCKS & LIQUIDITY SWEEPS...'), 1400);
      setTimeout(() => setAnalysisStep('GENERATING DETERMINISTIC TRADE PLAN & RISK LEVELS...'), 1900);
      setTimeout(() => setAnalysisStep('SYNTHESIZING INSTITUTIONAL AI RATIONALE...'), 2400);

      const response = await fetch('/api/analyze-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Server returned HTTP ${response.status}`);
      }

      result.id = `LIVE-${Date.now()}`;
      result.timestamp = new Date().toISOString();
      setAnalysisResult(result);
    } catch (error: any) {
      console.error('Live analysis failed:', error);
      alert(error.message || 'Live analysis encountered an issue.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  // Perform AI Chart Screenshot Analysis
  const handleAnalyzeScreenshot = async (params: {
    images: UploadedImage[];
    instrument: string;
    timeframe: string;
    tradingStyle: TradingStyle;
    analysisType: AnalysisType;
    userCurrentPrice?: number;
  }) => {
    setIsAnalyzing(true);
    setAnalysisStep('INITIALIZING MULTIMODAL VISION MODEL...');

    try {
      setTimeout(() => setAnalysisStep('PARSING CANDLE SCALE & PRICE LADDER...'), 500);
      setTimeout(() => setAnalysisStep('TRACING BOS, CHOCH & SWING STRUCTURE...'), 1100);
      setTimeout(() => setAnalysisStep('EVALUATING ORDER BLOCKS & LIQUIDITY SWEEPS...'), 1700);

      const response = await fetch('/api/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: params.images.map((img) => ({
            data: img.data,
            timeframe: img.timeframe,
            name: img.name,
          })),
          instrument: params.instrument,
          timeframe: params.timeframe,
          tradingStyle: params.tradingStyle,
          analysisType: params.analysisType,
          userCurrentPrice: params.userCurrentPrice,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result: SignalAnalysisResult = await response.json();
      result.id = `SIG-${Date.now()}`;
      result.timestamp = new Date().toISOString();
      result.chartImageBase64 = params.images[0]?.data;

      setAnalysisResult(result);
    } catch (error: any) {
      console.error('Analysis failed:', error);
      alert('Analysis request encountered an issue: ' + (error.message || 'Please check input and try again.'));
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  // Save analysis to trade journal
  const handleSaveToJournal = (notes: string) => {
    if (!analysisResult) return;

    const newEntry: JournalEntry = {
      id: `JRN-${Date.now()}`,
      createdAt: new Date().toISOString(),
      instrument: analysisResult.instrument,
      timeframe: analysisResult.timeframe,
      tradingStyle: 'Day Trading',
      analysisType: 'Smart Money Concepts (SMC)',
      decision: analysisResult.decision,
      confidenceScore: analysisResult.confidenceScore,
      currentPrice: analysisResult.detectedCurrentPrice,
      tradePlan: analysisResult.tradePlan,
      rationale: analysisResult.decisionRationale,
      outcome: 'PENDING',
      userNotes: notes,
      screenshotThumbnail: analysisResult.chartImageBase64,
    };

    saveJournal([newEntry, ...journalEntries]);
  };

  const handleUpdateOutcome = (id: string, outcome: TradeOutcome, realizedR?: number, userNotes?: string) => {
    const updated = journalEntries.map((e) => {
      if (e.id === id) {
        return {
          ...e,
          outcome,
          realizedR: realizedR !== undefined ? realizedR : e.realizedR,
          userNotes: userNotes !== undefined ? userNotes : e.userNotes,
        };
      }
      return e;
    });
    saveJournal(updated);
  };

  const handleDeleteEntry = (id: string) => {
    saveJournal(journalEntries.filter((e) => e.id !== id));
  };

  const handleClearAllJournal = () => {
    if (window.confirm('Clear all trade journal logs?')) {
      saveJournal([]);
    }
  };

  const handleOpenCalculatorForTrade = (entry: number, sl: number, symbol: string) => {
    setCalcPreset({ entry, sl, symbol });
    setIsCalcOpen(true);
  };

  // Check if current analysis is already saved in journal
  const isCurrentAnalysisSaved = Boolean(
    analysisResult &&
    journalEntries.some(
      (e) =>
        e.instrument === analysisResult.instrument &&
        e.timeframe === analysisResult.timeframe &&
        Math.abs(new Date(e.createdAt).getTime() - new Date(analysisResult.timestamp || '').getTime()) < 60000
    )
  );

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200 bg-grid-pattern">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        journalCount={journalEntries.length}
        onOpenDisclaimer={() => setIsDisclaimerOpen(true)}
        aiEngineStatus={aiEngineStatus}
      />

      {/* Ticker Bar */}
      <TickerBar />

      {/* Main Terminal Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* TAB 1: ANALYZER */}
        {activeTab === 'analyzer' && (
          <div className="space-y-6">
            {/* Chart Uploader */}
            <ChartUploader
              onAnalyzeScreenshot={handleAnalyzeScreenshot}
              onAnalyzeLive={handleAnalyzeLive}
              isAnalyzing={isAnalyzing}
              analysisStep={analysisStep}
            />

            {/* Analysis Result Card */}
            {analysisResult && (
              <SignalCard
                result={analysisResult}
                onSaveToJournal={handleSaveToJournal}
                onOpenCalculatorForTrade={handleOpenCalculatorForTrade}
                isSaved={isCurrentAnalysisSaved}
              />
            )}
          </div>
        )}

        {/* TAB 2: LIVE CHART & SCANNER */}
        {activeTab === 'chart' && (
          <div className="space-y-6">
            <InteractiveChart
              initialSymbol={analysisResult?.instrument || 'EURUSD'}
              tradePlan={analysisResult?.tradePlan}
              direction={analysisResult?.decision}
            />
          </div>
        )}

        {/* TAB 3: BACKTESTING ENGINE */}
        {activeTab === 'backtest' && (
          <div className="space-y-6">
            <BacktestView />
          </div>
        )}

        {/* TAB 4: TRADE JOURNAL */}
        {activeTab === 'journal' && (
          <div className="space-y-6">
            <TradeJournal
              entries={journalEntries}
              onUpdateOutcome={handleUpdateOutcome}
              onDeleteEntry={handleDeleteEntry}
              onClearAll={handleClearAllJournal}
            />
          </div>
        )}

        {/* TAB 5: RISK CALCULATOR TAB */}
        {activeTab === 'calculator' && (
          <div className="space-y-6">
            <RiskCalculatorModal
              isOpen={true}
              isEmbedded={true}
              onClose={() => setActiveTab('analyzer')}
              initialSymbol={calcPreset.symbol || analysisResult?.instrument || 'EURUSD'}
              initialEntry={calcPreset.entry || analysisResult?.tradePlan?.entryZone.optimal}
              initialStopLoss={calcPreset.sl || analysisResult?.tradePlan?.stopLoss}
            />
          </div>
        )}
      </main>

      {/* Risk Calculator Floating Modal (triggered from Signal Card) */}
      {isCalcOpen && activeTab !== 'calculator' && (
        <RiskCalculatorModal
          isOpen={isCalcOpen}
          onClose={() => setIsCalcOpen(false)}
          initialSymbol={calcPreset.symbol || 'EURUSD'}
          initialEntry={calcPreset.entry}
          initialStopLoss={calcPreset.sl}
        />
      )}

      {/* Disclaimer & Methodology Modal */}
      <DisclaimerModal
        isOpen={isDisclaimerOpen}
        onClose={() => setIsDisclaimerOpen(false)}
      />

      {/* Terminal Footer */}
      <footer className="border-t border-[#141d30] bg-[#060911] py-4 text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-bold">AEGIS ALPHA QUANT TERMINAL</span>
            <span>&bull;</span>
            <span>Institutional Multi-Timeframe Analysis Engine</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <button
              onClick={() => setIsDisclaimerOpen(true)}
              className="text-slate-400 hover:text-amber-300 transition-colors"
            >
              Risk Disclosures
            </button>
            <span className="text-slate-600">&bull;</span>
            <span>No Live Broker Routing</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-emerald-400">System Nominal</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

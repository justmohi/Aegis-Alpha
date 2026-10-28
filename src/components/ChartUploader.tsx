import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Plus,
  Trash2,
  Sparkles,
  Sliders,
  AlertCircle,
  CheckCircle2,
  FileCheck,
  Layers,
  ChevronDown,
  Activity,
  Zap,
  RefreshCw,
  Search,
  Key,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import {
  TradingStyle,
  AnalysisType,
  UploadedImage,
  SampleChartFixture,
  QuoteData,
  TwelveDataStatus,
} from '../types/trading.ts';
import { SAMPLE_CHART_FIXTURES } from '../utils/sample-charts.ts';
import { INSTRUMENT_SPECS } from '../utils/trading-math.ts';

interface ChartUploaderProps {
  onAnalyzeScreenshot: (data: {
    images: UploadedImage[];
    instrument: string;
    timeframe: string;
    tradingStyle: TradingStyle;
    analysisType: AnalysisType;
    userCurrentPrice?: number;
  }) => Promise<void>;
  onAnalyzeLive: (data: {
    symbol: string;
    timeframe: string;
    tradingStyle: TradingStyle;
    analysisType: AnalysisType;
    riskRewardTarget: number;
    includeHTF: boolean;
    useEntryRefinement?: boolean;
  }) => Promise<void>;
  isAnalyzing: boolean;
  analysisStep: string;
}

const POPULAR_SYMBOLS = [
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', type: 'Forex' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', type: 'Forex' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', type: 'Forex' },
  { symbol: 'XAU/USD', name: 'Spot Gold / US Dollar', type: 'Metals' },
  { symbol: 'XAG/USD', name: 'Spot Silver / US Dollar', type: 'Metals' },
  { symbol: 'BTC/USD', name: 'Bitcoin / US Dollar', type: 'Crypto' },
  { symbol: 'ETH/USD', name: 'Ethereum / US Dollar', type: 'Crypto' },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', type: 'Forex' },
];

const TIMEFRAMES = [
  { id: 'M1', label: '1m', title: '1-Minute' },
  { id: 'M5', label: '5m', title: '5-Minute' },
  { id: 'M15', label: '15m', title: '15-Minute' },
  { id: 'M30', label: '30m', title: '30-Minute' },
  { id: 'H1', label: '1h', title: '1-Hour' },
  { id: 'H4', label: '4h', title: '4-Hour' },
  { id: 'D1', label: '1D', title: 'Daily' },
];

export const ChartUploader: React.FC<ChartUploaderProps> = ({
  onAnalyzeScreenshot,
  onAnalyzeLive,
  isAnalyzing,
  analysisStep,
}) => {
  // Mode selection: 'live' (Twelve Data) vs 'screenshot' (Multimodal Vision)
  const [activeMode, setActiveMode] = useState<'live' | 'screenshot'>('live');

  // Common parameters
  const [instrument, setInstrument] = useState<string>('EUR/USD');
  const [timeframe, setTimeframe] = useState<string>('M15');
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>('Day Trading');
  const [analysisType, setAnalysisType] = useState<AnalysisType>('Smart Money Concepts (SMC)');
  const [riskRewardTarget, setRiskRewardTarget] = useState<number>(2.0);
  const [includeHTF, setIncludeHTF] = useState<boolean>(true);
  const [useEntryRefinement, setUseEntryRefinement] = useState<boolean>(false);

  // Live Data & Quote state
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<TwelveDataStatus | null>(null);
  const [showConfigHelp, setShowConfigHelp] = useState<boolean>(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; instrument_name: string }>>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Screenshot upload state
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [activeImageTab, setActiveImageTab] = useState<number>(0);
  const [manualPrice, setManualPrice] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Twelve Data status on mount
  useEffect(() => {
    fetch('/api/market-status')
      .then((res) => res.json())
      .then((data) => setMarketStatus(data))
      .catch((err) => console.warn('Could not fetch Twelve Data status', err));
  }, []);

  // Fetch Live Quote when instrument changes
  const fetchLiveQuote = async (symbolToFetch: string) => {
    setIsQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbolToFetch)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setQuoteError(data.error || 'Quote unavailable from provider');
        setQuote(null);
      } else {
        setQuote(data.quote);
      }
    } catch (err: any) {
      setQuoteError(err.message || 'Connection error to quote feed');
      setQuote(null);
    } finally {
      setIsQuoteLoading(false);
    }
  };

  useEffect(() => {
    if (activeMode === 'live') {
      fetchLiveQuote(instrument);
    }
  }, [instrument, activeMode]);

  // Handle symbol search input
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }

    setIsSearching(true);
    setIsSearchOpen(true);
    try {
      const res = await fetch(`/api/symbol-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.warn('Search query failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSymbol = (sym: string) => {
    setInstrument(sym);
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  // Helper for sample screenshots
  const handleSelectSample = (sample: SampleChartFixture) => {
    setInstrument(sample.instrument);
    setTimeframe(sample.timeframe);
    setTradingStyle(sample.style);
    setAnalysisType(sample.strategy);
    setErrorMsg(null);

    const newImage: UploadedImage = {
      id: `sample-${Date.now()}`,
      data: sample.dataUrl,
      name: `${sample.instrument}_${sample.timeframe}_sample.png`,
      timeframe: sample.timeframe,
      label: `Primary Execution (${sample.timeframe})`,
    };
    setImages([newImage]);
    setActiveImageTab(0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMsg(null);
    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];

    Array.from(files).forEach((file, index) => {
      if (!validTypes.includes(file.type)) {
        setErrorMsg('Invalid file format. Please upload PNG, JPG, or WEBP chart screenshots.');
        return;
      }

      if (file.size > 15 * 1024 * 1024) {
        setErrorMsg('File exceeds 15MB limit. Please upload a compressed screenshot.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const label =
          images.length === 0 && index === 0
            ? `Primary Execution (${timeframe})`
            : `HTF Context (${images.length === 1 ? 'H1' : 'H4'})`;

        const newImg: UploadedImage = {
          id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          data: base64,
          name: file.name,
          timeframe: images.length === 0 ? timeframe : images.length === 1 ? 'H1' : 'H4',
          label,
        };

        setImages((prev) => [...prev, newImg]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (activeImageTab >= filtered.length) {
        setActiveImageTab(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  // Submit Live Analysis
  const handleLiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    onAnalyzeLive({
      symbol: instrument,
      timeframe,
      tradingStyle,
      analysisType,
      riskRewardTarget,
      includeHTF,
      useEntryRefinement,
    });
  };

  // Submit Screenshot Analysis
  const handleScreenshotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (images.length === 0) {
      setErrorMsg('Please upload at least one chart screenshot or select a test fixture.');
      return;
    }

    const priceNum = manualPrice.trim() ? parseFloat(manualPrice.trim()) : undefined;
    if (priceNum !== undefined && (isNaN(priceNum) || priceNum <= 0)) {
      setErrorMsg('Please enter a valid positive current price or leave blank for visual detection.');
      return;
    }

    setErrorMsg(null);
    onAnalyzeScreenshot({
      images,
      instrument: instrument.replace('/', ''),
      timeframe,
      tradingStyle,
      analysisType,
      userCurrentPrice: priceNum,
    });
  };

  return (
    <div className="bg-[#0b1222] border border-[#1b263b] rounded-xl overflow-hidden shadow-2xl">
      {/* Dual Mode Switcher */}
      <div className="flex border-b border-[#1b263b] bg-[#070b14]/70">
        <button
          type="button"
          onClick={() => {
            setActiveMode('live');
            setErrorMsg(null);
          }}
          className={`flex-1 py-3.5 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 transition-all ${
            activeMode === 'live'
              ? 'bg-[#0f172a] text-amber-300 border-b-2 border-amber-400 font-mono'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          <span>REAL MARKET DATA (TWELVE DATA)</span>
          <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            DETERMINISTIC
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMode('screenshot');
            setErrorMsg(null);
          }}
          className={`flex-1 py-3.5 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 transition-all ${
            activeMode === 'screenshot'
              ? 'bg-[#0f172a] text-amber-300 border-b-2 border-amber-400 font-mono'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <ImageIcon className="w-4 h-4 text-slate-300" />
          <span>CHART SCREENSHOT UPLOAD</span>
          <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
            MULTIMODAL AI
          </span>
        </button>
      </div>

      {/* Mode 1: Live Twelve Data Feed */}
      {activeMode === 'live' && (
        <form onSubmit={handleLiveSubmit} className="p-5 sm:p-6 space-y-6">
          {/* Top row: Symbol & Timeframe */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* Instrument Selection & Search */}
            <div className="md:col-span-7 space-y-2 relative">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5 font-mono">
                  <span>Instrument / Asset</span>
                </label>
                <span className="text-[11px] text-slate-400">Twelve Data Verified Ticker</span>
              </div>

              {/* Popular Symbols Quick Chips */}
              <div className="flex flex-wrap gap-1.5 pb-1">
                {POPULAR_SYMBOLS.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => handleSelectSymbol(item.symbol)}
                    className={`px-2.5 py-1 text-xs rounded font-mono font-medium transition-colors ${
                      instrument === item.symbol
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-[#141e33] text-slate-300 hover:bg-[#1a2742] hover:text-white border border-[#223150]'
                    }`}
                  >
                    {item.symbol}
                  </button>
                ))}
              </div>

              {/* Custom Search Input */}
              <div className="relative">
                <div className="flex items-center bg-[#070d18] border border-[#1e2c47] rounded-lg px-3 py-2 text-sm text-slate-200 focus-within:border-amber-400 transition-colors">
                  <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder={`Or search any symbol (e.g. USD/CHF, GBP/JPY, SOL/USD)...`}
                    className="bg-transparent border-none outline-none w-full text-xs font-mono placeholder:text-slate-500"
                  />
                  {isSearching && <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin ml-2 shrink-0" />}
                </div>

                {/* Autocomplete Dropdown */}
                {isSearchOpen && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#0c1424] border border-[#233352] rounded-lg shadow-2xl z-50 max-h-56 overflow-y-auto">
                    {searchResults.map((res) => (
                      <button
                        key={res.symbol}
                        type="button"
                        onClick={() => handleSelectSymbol(res.symbol)}
                        className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-[#162238] flex items-center justify-between border-b border-slate-800/40"
                      >
                        <span className="font-bold text-amber-300">{res.symbol}</span>
                        <span className="text-slate-400 text-[11px] truncate ml-2">{res.instrument_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Timeframe Selector */}
            <div className="md:col-span-5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                  Primary Timeframe
                </label>
                <span className="text-[11px] text-slate-400">Execution Interval</span>
              </div>
              <div className="grid grid-cols-7 gap-1 bg-[#070d18] p-1 rounded-lg border border-[#1e2c47]">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => setTimeframe(tf.id)}
                    title={tf.title}
                    className={`py-2 text-xs font-mono font-bold rounded transition-colors text-center ${
                      timeframe === tf.id
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#141f36]'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Real-Time Live Quote Bar & Provider Telemetry */}
          <div className="bg-[#070d19] border border-[#1a2742] rounded-lg p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-mono">
            {/* Quote details */}
            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
              <div className="flex items-center space-x-2">
                <span className="text-amber-400 font-bold text-sm">{instrument}</span>
                {quote ? (
                  <span className="text-base font-extrabold text-white">
                    {quote.price > 1000
                      ? quote.price.toLocaleString(undefined, { minimumFractionDigits: 2 })
                      : quote.price.toFixed(instrument.includes('JPY') ? 3 : 5)}
                  </span>
                ) : (
                  <span className="text-slate-500 italic">
                    {isQuoteLoading ? 'Fetching quote...' : 'Awaiting provider feed'}
                  </span>
                )}
              </div>

              {quote && (
                <div
                  className={`flex items-center space-x-1 font-bold ${
                    quote.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  <span>{quote.change >= 0 ? '+' : ''}{quote.change.toFixed(4)}</span>
                  <span>({quote.change >= 0 ? '+' : ''}{quote.percentChange.toFixed(2)}%)</span>
                </div>
              )}

              {quote && (
                <div className="hidden sm:flex items-center space-x-3 text-slate-400 text-[11px]">
                  <span>H: {quote.high.toFixed(4)}</span>
                  <span>L: {quote.low.toFixed(4)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      quote.isMarketOpen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {quote.isMarketOpen ? 'MARKET OPEN' : 'SESSION CLOSED'}
                  </span>
                </div>
              )}
            </div>

            {/* Provider Attribution & Telemetry */}
            <div className="flex items-center space-x-3 self-end md:self-auto text-[11px] text-slate-400">
              <div className="flex items-center space-x-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    marketStatus?.configured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span className="text-slate-300 font-semibold">
                  {marketStatus?.configured ? 'Twelve Data Connected' : 'Twelve Data Disconnected'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => fetchLiveQuote(instrument)}
                disabled={isQuoteLoading}
                className="p-1 text-slate-400 hover:text-amber-300 hover:bg-[#16233a] rounded transition-colors"
                title="Refresh Quote"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isQuoteLoading ? 'animate-spin text-amber-400' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setShowConfigHelp(!showConfigHelp)}
                className="text-amber-400/80 hover:text-amber-300 underline underline-offset-2 flex items-center space-x-1"
              >
                <Key className="w-3 h-3" />
                <span>API Status</span>
              </button>
            </div>
          </div>

          {/* Quote Error Notice if provider returned error or key needed */}
          {quoteError && (
            <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-lg text-amber-300 text-xs font-mono flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Twelve Data Telemetry: </span>
                <span>{quoteError}</span>
              </div>
            </div>
          )}

          {/* Config / Key Help Accordion */}
          {showConfigHelp && (
            <div className="p-4 rounded-lg bg-[#070b14] border border-amber-500/30 text-xs text-slate-300 space-y-2 font-mono">
              <div className="flex items-center justify-between text-amber-300 font-bold">
                <span className="flex items-center space-x-1.5">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>Twelve Data API Key Configuration</span>
                </span>
                <span className="text-[11px] font-normal text-slate-400">
                  Status: {marketStatus?.configured ? 'CONFIGURED & ACTIVE' : 'KEY REQUIRED'}
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed font-sans">
                To stream real live ticks and historical OHLCV candles, set <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">TWELVE_DATA_API_KEY</code> in server secrets or <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">.env</code>. Free tier accounts receive 8 credits/min and 800 credits/day.
              </p>
              <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                <span>&bull; Rate Limit: 8 calls/min (In-memory cached)</span>
                <span>&bull; Supported Intervals: M1, M5, M15, M30, H1, H4, D1</span>
                <span>&bull; Precious Metals: XAU/USD, XAG/USD</span>
              </div>
            </div>
          )}

          {/* Parameters row: Style, Strategy, Confluence & Refinement */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Trading Style */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Trading Style
              </label>
              <select
                value={tradingStyle}
                onChange={(e) => setTradingStyle(e.target.value as TradingStyle)}
                className="w-full bg-[#070d18] border border-[#1e2c47] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-amber-400 outline-none"
              >
                <option value="Scalping">Scalping (M1 - M5)</option>
                <option value="Day Trading">Day Trading (M5 - H1)</option>
                <option value="Swing Trading">Swing Trading (H1 - D1)</option>
              </select>
            </div>

            {/* Analysis Strategy */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Strategy Model
              </label>
              <select
                value={analysisType}
                onChange={(e) => setAnalysisType(e.target.value as AnalysisType)}
                className="w-full bg-[#070d18] border border-[#1e2c47] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-amber-400 outline-none"
              >
                <option value="Smart Money Concepts (SMC)">Smart Money Concepts (SMC)</option>
                <option value="Price Action & Key Levels">Price Action & Key Levels</option>
                <option value="Trend Following & Momentum">Trend Following & Momentum</option>
                <option value="Breakout & Liquidity Sweep">Breakout & Liquidity Sweep</option>
              </select>
            </div>

            {/* Target Risk:Reward */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Target Risk : Reward
              </label>
              <select
                value={riskRewardTarget}
                onChange={(e) => setRiskRewardTarget(parseFloat(e.target.value))}
                className="w-full bg-[#070d18] border border-[#1e2c47] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-amber-400 outline-none"
              >
                <option value="1.5">1 : 1.5 Minimum R</option>
                <option value="2.0">1 : 2.0 Standard R (Recommended)</option>
                <option value="2.5">1 : 2.5 Conservative R</option>
                <option value="3.0">1 : 3.0 Asymmetric R</option>
              </select>
            </div>

            {/* Multi-Timeframe Confluence Toggle */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Confluence Filters
              </label>
              <div className="space-y-1.5 text-xs font-mono text-slate-300">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeHTF}
                    onChange={(e) => setIncludeHTF(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span>H4 + H1 HTF Alignment</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useEntryRefinement}
                    onChange={(e) => setUseEntryRefinement(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span>LTF Entry Refinement</span>
                </label>
              </div>
            </div>
          </div>

          {/* Error notice */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/50 rounded-lg text-rose-300 text-xs font-mono flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submit Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isAnalyzing}
              className="w-full py-3.5 px-6 rounded-lg font-mono font-bold text-sm tracking-wider uppercase transition-all flex items-center justify-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>{analysisStep || 'CALCULATING DETERMINISTIC TRADE PLAN...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-slate-950 fill-current" />
                  <span>ANALYZE LIVE MARKET ({instrument} &bull; {timeframe})</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-center text-slate-500 mt-2 font-mono">
              Calculates Market Structure (HH/HL/LH/LL), BOS/CHOCH, Liquidity Sweeps, Support/Resistance & ATR buffers deterministically from real OHLCV candles.
            </p>
          </div>
        </form>
      )}

      {/* Mode 2: Screenshot Upload Form */}
      {activeMode === 'screenshot' && (
        <form onSubmit={handleScreenshotSubmit} className="p-5 sm:p-6 space-y-6">
          {/* Preset Chart Fixtures */}
          <div className="bg-[#070b14] border border-[#182338] rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-amber-400 flex items-center space-x-1.5">
                <FileCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>BENCHMARK TEST FIXTURES (ONE-CLICK PRELOAD)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Verified Multimodal Scenarios</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SAMPLE_CHART_FIXTURES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  className="text-left p-2.5 rounded bg-[#0f172a] hover:bg-[#15203a] border border-[#1e2b45] hover:border-amber-500/40 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-slate-200 group-hover:text-amber-300">
                      {sample.title}
                    </span>
                    <span
                      className={`text-[10px] px-1 py-0.2 rounded font-bold font-mono ${
                        sample.expectedDecision === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {sample.expectedDecision}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{sample.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Screenshot Dropzone */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center space-x-1.5">
                <Upload className="w-4 h-4 text-amber-400" />
                <span>Upload Chart Screenshots</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono">PNG, JPG, WEBP up to 15MB</span>
            </div>

            {images.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#223150] hover:border-amber-400/60 rounded-xl p-8 text-center cursor-pointer bg-[#070b14]/50 hover:bg-[#070b14] transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-6 h-6 text-amber-400" />
                </div>
                <h4 className="text-sm font-semibold text-slate-200 mb-1">
                  Click to select chart screenshots or drag and drop
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Supports screenshots from TradingView, MT4, MT5, cTrader. Multi-timeframe uploads enabled (e.g. M15 + H1).
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Image Tabs */}
                <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                  {images.map((img, idx) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setActiveImageTab(idx)}
                      className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                        activeImageTab === idx
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-[#0f172a] text-slate-400 hover:text-white border border-[#1e2b45]'
                      }`}
                    >
                      <span>Slot #{idx + 1} ({img.timeframe})</span>
                      <span
                        onClick={(e) => handleRemoveImage(img.id, e)}
                        className="text-slate-500 hover:text-rose-400 p-0.5 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </span>
                    </button>
                  ))}

                  {images.length < 3 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-amber-300 hover:bg-[#142036] border border-dashed border-[#223150]"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add HTF Slot</span>
                    </button>
                  )}
                </div>

                {/* Active Image Preview */}
                {images[activeImageTab] && (
                  <div className="relative rounded-lg overflow-hidden border border-[#223150] bg-[#050811] max-h-72 flex items-center justify-center">
                    <img
                      src={images[activeImageTab].data}
                      alt={images[activeImageTab].name}
                      className="max-h-72 object-contain w-full"
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/75 backdrop-blur text-[10px] font-mono text-amber-300 border border-amber-500/30">
                      {images[activeImageTab].label}
                    </div>
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Metadata Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Instrument
              </label>
              <select
                value={instrument.replace('/', '')}
                onChange={(e) => setInstrument(e.target.value)}
                className="w-full bg-[#070d18] border border-[#1e2c47] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-amber-400 outline-none"
              >
                <option value="EURUSD">EUR/USD (Euro)</option>
                <option value="GBPUSD">GBP/USD (Pound)</option>
                <option value="USDJPY">USD/JPY (Yen)</option>
                <option value="XAUUSD">XAU/USD (Gold)</option>
                <option value="XAGUSD">XAG/USD (Silver)</option>
                <option value="BTCUSD">BTC/USD (Bitcoin)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Chart Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full bg-[#070d18] border border-[#1e2c47] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-amber-400 outline-none"
              >
                <option value="M1">1-Minute (M1)</option>
                <option value="M5">5-Minute (M5)</option>
                <option value="M15">15-Minute (M15)</option>
                <option value="H1">1-Hour (H1)</option>
                <option value="H4">4-Hour (H4)</option>
                <option value="D1">Daily (D1)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Style & Strategy
              </label>
              <select
                value={analysisType}
                onChange={(e) => setAnalysisType(e.target.value as AnalysisType)}
                className="w-full bg-[#070d18] border border-[#1e2c47] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-amber-400 outline-none"
              >
                <option value="Smart Money Concepts (SMC)">Smart Money Concepts (SMC)</option>
                <option value="Price Action & Key Levels">Price Action & Key Levels</option>
                <option value="Trend Following & Momentum">Trend Following & Momentum</option>
                <option value="Breakout & Liquidity Sweep">Breakout & Liquidity Sweep</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Price Override (Optional)
              </label>
              <input
                type="text"
                placeholder="Leave blank for visual detection"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                className="w-full bg-[#070d18] border border-[#1e2c47] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:border-amber-400 outline-none placeholder:text-slate-600"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/50 rounded-lg text-rose-300 text-xs font-mono flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isAnalyzing}
              className="w-full py-3.5 px-6 rounded-lg font-mono font-bold text-sm tracking-wider uppercase transition-all flex items-center justify-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>{analysisStep || 'RUNNING MULTIMODAL AI VISION AUDIT...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>ANALYZE CHART SCREENSHOT WITH AI VISION</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-center text-slate-500 mt-2 font-mono">
              Audits visible candle ladders, swing structure, BOS/CHOCH markings, and liquidity pools without fabricating unreadable prices.
            </p>
          </div>
        </form>
      )}
    </div>
  );
};

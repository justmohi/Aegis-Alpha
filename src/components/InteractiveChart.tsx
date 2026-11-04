import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  RefreshCw,
  Clock,
  Layers,
  Eye,
  EyeOff,
  AlertTriangle,
  Info,
  Search,
  Wifi,
  Sliders,
  CheckCircle2,
  Zap,
  WifiOff,
} from 'lucide-react';
import { TradePlan } from '../types/trading.ts';

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface InteractiveChartProps {
  initialSymbol?: string;
  tradePlan?: TradePlan | null;
  direction?: 'BUY' | 'SELL' | 'WAIT';
}

const TIMEFRAMES = [
  { id: 'M1', label: '1m' },
  { id: 'M5', label: '5m' },
  { id: 'M15', label: '15m' },
  { id: 'M30', label: '30m' },
  { id: 'H1', label: '1h' },
  { id: 'H4', label: '4h' },
  { id: 'D1', label: '1D' },
];

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  initialSymbol = 'EUR/USD',
  tradePlan,
  direction,
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState('M15');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [provider, setProvider] = useState<string>('Twelve Data Financial Feed');
  const [isStale, setIsStale] = useState<boolean>(false);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Indicators & Overlays
  const [showIndicators, setShowIndicators] = useState(true);
  const [showTradeLevels, setShowTradeLevels] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);

  // Search input
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; instrument_name: string }>>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Fetch candle data
  const fetchMarketData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/market-data?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`);
      const data = await res.json();
      if (res.ok && data.candles) {
        setCandles(data.candles || []);
        setLastUpdate(data.lastUpdate || new Date().toISOString());
        setProvider(data.provider || 'Twelve Data Financial Feed');
        setIsStale(Boolean(data.isStale));
        setStaleReason(data.staleReason || null);
        setIsCached(Boolean(data.cached));
      }
    } catch (e) {
      console.error('Failed to load market data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
  }, [symbol, timeframe]);

  // Auto-refresh interval (every 30 seconds if enabled)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMarketData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, symbol, timeframe]);

  // Handle symbol search
  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.trim().length < 2) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/symbol-search?q=${encodeURIComponent(val)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
      setIsSearchOpen(true);
    } catch (err) {
      console.warn('Symbol search error', err);
    }
  };

  const selectSymbol = (sym: string) => {
    setSymbol(sym);
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  // Render high-performance Canvas candlestick chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const isMobile = width < 600;
    const padding = { top: 35, right: isMobile ? 65 : 80, bottom: 45, left: 10 };

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#080d19';
    ctx.fillRect(0, 0, width, height);

    // Price bounds
    let prices = candles.flatMap((c) => [c.high, c.low]);
    if (showTradeLevels && tradePlan && direction !== 'WAIT') {
      prices.push(tradePlan.stopLoss, tradePlan.takeProfit1, tradePlan.takeProfit2, tradePlan.entryZone.optimal);
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 0.0001;

    const chartHeight = height - padding.top - padding.bottom;
    const getY = (price: number) => {
      return padding.top + (1 - (price - minPrice) / priceRange) * chartHeight;
    };

    // Horizontal Grid Lines & Price Labels
    const gridSteps = 6;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;

    for (let i = 0; i <= gridSteps; i++) {
      const p = minPrice + (priceRange * i) / gridSteps;
      const y = getY(p);

      ctx.strokeStyle = '#141e30';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.fillText(p > 100 ? p.toFixed(2) : p.toFixed(symbol.includes('JPY') ? 3 : 5), width - padding.right + 8, y + 3);
    }
    ctx.setLineDash([]);

    // Volume sub-chart base
    const maxVolume = Math.max(...candles.map((c) => c.volume)) || 1;
    const volumeHeight = 35;

    // Candle widths
    const availableWidth = width - padding.left - padding.right;
    const candleWidth = availableWidth / candles.length;
    const bodyWidth = Math.max(2, candleWidth * 0.7);

    // Draw candles and volume
    candles.forEach((candle, index) => {
      const x = padding.left + index * candleWidth + candleWidth * 0.15;
      const isBull = candle.close >= candle.open;
      const color = isBull ? '#10b981' : '#ef4444';

      // Volume bar
      const vH = (candle.volume / maxVolume) * volumeHeight;
      ctx.fillStyle = isBull ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(x, height - padding.bottom + (volumeHeight - vH), bodyWidth, vH);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + bodyWidth / 2, getY(candle.high));
      ctx.lineTo(x + bodyWidth / 2, getY(candle.low));
      ctx.stroke();

      // Body
      const openY = getY(candle.open);
      const closeY = getY(candle.close);
      const bodyY = Math.min(openY, closeY);
      const bodyH = Math.max(2, Math.abs(closeY - openY));

      ctx.fillStyle = color;
      ctx.fillRect(x, bodyY, bodyWidth, bodyH);
    });

    // Moving Averages Overlay (EMA 20 & EMA 50)
    if (showIndicators && candles.length >= 20) {
      // 20 EMA
      ctx.beginPath();
      ctx.strokeStyle = '#eab308'; // Gold / Amber
      ctx.lineWidth = 1.6;
      for (let i = 19; i < candles.length; i++) {
        const slice = candles.slice(i - 19, i + 1);
        const avg = slice.reduce((acc, c) => acc + c.close, 0) / 20;
        const x = padding.left + i * candleWidth + bodyWidth / 2;
        const y = getY(avg);
        if (i === 19) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 50 EMA
      if (candles.length >= 35) {
        ctx.beginPath();
        ctx.strokeStyle = '#38bdf8'; // Sky blue
        ctx.lineWidth = 1.6;
        for (let i = 34; i < candles.length; i++) {
          const slice = candles.slice(i - 34, i + 1);
          const avg = slice.reduce((acc, c) => acc + c.close, 0) / 35;
          const x = padding.left + i * candleWidth + bodyWidth / 2;
          const y = getY(avg);
          if (i === 34) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Trade Plan Overlays (Entry, SL, TP1, TP2)
    if (showTradeLevels && tradePlan && direction !== 'WAIT') {
      const drawLevel = (price: number, label: string, color: string, isDashed = false) => {
        const y = getY(price);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        if (isDashed) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Label Tag
        const badgeWidth = isMobile ? 60 : 75;
        ctx.fillStyle = color;
        ctx.fillRect(width - padding.right, y - 9, badgeWidth, 18);
        ctx.fillStyle = '#070b14';
        ctx.font = isMobile ? 'bold 8px monospace' : 'bold 9px monospace';
        const formattedPrice = price > 100 ? price.toFixed(1) : price.toFixed(symbol.includes('JPY') ? 3 : 4);
        ctx.fillText(`${label} ${formattedPrice}`, width - padding.right + 2, y + 3);
      };

      drawLevel(tradePlan.entryZone.optimal, 'ENTRY', '#38bdf8');
      drawLevel(tradePlan.stopLoss, 'SL', '#ef4444');
      drawLevel(tradePlan.takeProfit1, 'TP1', '#10b981');
      drawLevel(tradePlan.takeProfit2, 'TP2', '#059669', true);
    }

    // Draw Crosshair on mouse hover
    if (crosshairPos) {
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 2]);

      // Vertical
      ctx.beginPath();
      ctx.moveTo(crosshairPos.x, padding.top);
      ctx.lineTo(crosshairPos.x, height - padding.bottom);
      ctx.stroke();

      // Horizontal
      ctx.beginPath();
      ctx.moveTo(padding.left, crosshairPos.y);
      ctx.lineTo(width - padding.right, crosshairPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [candles, showIndicators, showTradeLevels, tradePlan, direction, crosshairPos, symbol]);

  // Handle canvas mouse move for inspect crosshair
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = { left: 15, right: 80 };
    const availableWidth = rect.width - padding.left - padding.right;
    const candleWidth = availableWidth / candles.length;

    const idx = Math.floor((x - padding.left) / candleWidth);
    if (idx >= 0 && idx < candles.length) {
      setHoveredCandle(candles[idx]);
      setCrosshairPos({ x, y });
    } else {
      setHoveredCandle(null);
      setCrosshairPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredCandle(null);
    setCrosshairPos(null);
  };

  const lastCandle = candles[candles.length - 1];

  return (
    <div className="bg-[#0b101d] rounded-xl border border-[#182338] shadow-2xl overflow-hidden space-y-3">
      {/* Top Chart Toolbar */}
      <div className="bg-[#0f172a] px-4 py-3 border-b border-[#1b273f] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Symbol Select / Search */}
          <div className="relative">
            <div className="flex items-center space-x-1">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-[#101726] border border-[#1f2d48] text-amber-300 font-bold rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-500"
              >
                <option value="EUR/USD">EUR/USD</option>
                <option value="GBP/USD">GBP/USD</option>
                <option value="USD/JPY">USD/JPY</option>
                <option value="XAU/USD">XAU/USD (Gold)</option>
                <option value="XAG/USD">XAG/USD (Silver)</option>
                <option value="BTC/USD">BTC/USD (Bitcoin)</option>
                <option value="ETH/USD">ETH/USD (Ethereum)</option>
                <option value="USD/CAD">USD/CAD</option>
                <option value="AUD/USD">AUD/USD</option>
              </select>

              {/* Quick Search trigger */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Find ticker..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="bg-[#101726] border border-[#1f2d48] text-xs font-mono px-2 py-1.5 rounded w-28 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
                {isSearchOpen && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-[#0c1424] border border-[#233352] rounded-lg shadow-2xl z-50 max-h-48 overflow-y-auto">
                    {searchResults.map((r) => (
                      <button
                        key={r.symbol}
                        onClick={() => selectSymbol(r.symbol)}
                        className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-[#162238] flex items-center justify-between border-b border-slate-800/40 text-slate-200"
                      >
                        <span className="font-bold text-amber-300">{r.symbol}</span>
                        <span className="text-[10px] text-slate-400 truncate ml-2">{r.instrument_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Timeframe Select */}
          <div className="flex items-center space-x-1 bg-[#101726] p-0.5 rounded border border-[#1f2d48]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`px-2 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                  timeframe === tf.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Price details */}
          {lastCandle && (
            <div className="hidden sm:flex items-center space-x-3 text-xs font-mono">
              <span className="text-slate-400">Latest:</span>
              <span
                className={`font-bold ${
                  lastCandle.close >= lastCandle.open ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {lastCandle.close > 100
                  ? lastCandle.close.toLocaleString(undefined, { minimumFractionDigits: 2 })
                  : lastCandle.close.toFixed(symbol.includes('JPY') ? 3 : 5)}
              </span>
            </div>
          )}
        </div>

        {/* Right Chart Controls */}
        <div className="flex items-center space-x-2 text-xs font-mono">
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className={`px-2.5 py-1 rounded border flex items-center space-x-1.5 transition-colors ${
              showIndicators
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
            title="Toggle EMA 20 and EMA 50"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">EMA 20/50</span>
          </button>

          {tradePlan && direction !== 'WAIT' && (
            <button
              onClick={() => setShowTradeLevels(!showTradeLevels)}
              className={`px-2.5 py-1 rounded border flex items-center space-x-1.5 transition-colors ${
                showTradeLevels
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400'
              }`}
              title="Toggle AI Signal Overlay (Entry, SL, TP1, TP2)"
            >
              {showTradeLevels ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">Trade Levels</span>
            </button>
          )}

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2 py-1 rounded border text-[11px] flex items-center space-x-1 ${
              autoRefresh ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Auto-refresh chart every 30 seconds"
          >
            <Wifi className="w-3 h-3" />
            <span className="hidden sm:inline">Auto 30s</span>
          </button>

          <button
            onClick={fetchMarketData}
            disabled={isLoading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
            title="Refresh candles now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stale Data Warning Banner if applicable */}
      {isStale && (
        <div className="mx-4 p-2.5 bg-amber-950/40 border border-amber-500/50 rounded-lg text-amber-300 text-xs font-mono flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Notice: {staleReason || 'Market data contains historical or closed session timestamps.'}</span>
        </div>
      )}

      {/* Canvas Viewport */}
      <div className="p-4 relative">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-[400px] rounded-lg border border-slate-800 bg-[#080d19] cursor-crosshair block"
        />

        {/* Empty State Overlay when no live candles */}
        {candles.length === 0 && !isLoading && (
          <div className="absolute inset-4 rounded-lg bg-[#080d19]/95 backdrop-blur-sm border border-slate-800 flex flex-col items-center justify-center p-6 text-center z-10 font-mono">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
              <Zap className="w-6 h-6 text-amber-400" />
            </div>
            <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider mb-1">
              Twelve Data Feed Disconnected ({symbol} &bull; {timeframe})
            </h4>
            <p className="text-xs text-slate-400 max-w-md font-sans mb-4 leading-relaxed">
              {feedError || 'Real OHLCV candle streams require a valid TWELVE_DATA_API_KEY server secret. In accordance with platform integrity standards, synthetic candles are not simulated.'}
            </p>
            <div className="flex items-center space-x-3 text-xs">
              <button
                type="button"
                onClick={fetchMarketData}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded flex items-center space-x-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          </div>
        )}

        {/* Chart Legend */}
        {candles.length > 0 && (
          <div className="absolute top-6 left-6 flex items-center space-x-3 text-[10px] font-mono bg-[#0a0f1d]/90 px-3 py-1.5 rounded border border-slate-800 backdrop-blur pointer-events-none">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
              <span className="text-slate-300">Bullish</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm" />
              <span className="text-slate-300">Bearish</span>
            </div>
            {showIndicators && (
              <>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-0.5 bg-amber-400" />
                  <span className="text-amber-300">EMA 20</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-0.5 bg-sky-400" />
                  <span className="text-sky-300">EMA 50</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Hover Inspector Tooltip */}
        {hoveredCandle && (
          <div className="absolute top-6 right-6 text-[10px] font-mono bg-[#0a0f1d]/90 px-3 py-1.5 rounded border border-slate-800 backdrop-blur text-slate-300 space-x-3 pointer-events-none">
            <span className="text-slate-400">{new Date(hoveredCandle.time).toLocaleTimeString()}</span>
            <span>O: <b className="text-white">{hoveredCandle.open}</b></span>
            <span>H: <b className="text-emerald-400">{hoveredCandle.high}</b></span>
            <span>L: <b className="text-rose-400">{hoveredCandle.low}</b></span>
            <span>C: <b className="text-amber-300">{hoveredCandle.close}</b></span>
            <span>Vol: <b className="text-slate-400">{hoveredCandle.volume}</b></span>
          </div>
        )}
      </div>

      {/* Chart Footer: Honest Provider metadata & timestamp */}
      <div className="px-5 py-2.5 bg-[#080d19] border-t border-[#152033] flex flex-wrap items-center justify-between text-xs font-mono text-slate-400">
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${candles.length > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span>Feed: {provider}</span>
          {isCached && <span className="text-[10px] text-slate-500">(Cached)</span>}
        </div>
        <div className="flex items-center space-x-4 text-[11px]">
          <span>Candles: {candles.length}</span>
          <span>Interval: {timeframe}</span>
          {lastUpdate && (
            <span>Last Update: {lastUpdate.includes('T') ? new Date(lastUpdate).toLocaleTimeString() : lastUpdate}</span>
          )}
        </div>
      </div>
    </div>
  );
};

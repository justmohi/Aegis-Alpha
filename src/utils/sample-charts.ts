import { SampleChartFixture } from '../types/trading.ts';

/**
 * Creates clean SVG candlestick chart images for demo/fixture testing
 */
function createChartSvg(options: {
  symbol: string;
  timeframe: string;
  candles: Array<[number, number, number, number]>; // [open, high, low, close]
  levels?: { entry?: number; sl?: number; tp?: number };
  theme: 'bullish' | 'bearish' | 'range';
}): string {
  const { symbol, timeframe, candles, levels, theme } = options;
  const width = 800;
  const height = 450;
  const padding = { top: 60, right: 80, bottom: 40, left: 20 };

  const prices = candles.flatMap(c => [c[1], c[2]]);
  if (levels?.entry) prices.push(levels.entry);
  if (levels?.sl) prices.push(levels.sl);
  if (levels?.tp) prices.push(levels.tp);

  const minPrice = Math.min(...prices) * 0.9995;
  const maxPrice = Math.max(...prices) * 1.0005;
  const priceRange = maxPrice - minPrice || 1;

  const getY = (p: number) => {
    return height - padding.bottom - ((p - minPrice) / priceRange) * (height - padding.top - padding.bottom);
  };

  const candleWidth = (width - padding.left - padding.right) / candles.length;

  let candleSvg = '';
  candles.forEach((c, i) => {
    const [open, high, low, close] = c;
    const x = padding.left + i * candleWidth + candleWidth * 0.15;
    const bodyW = candleWidth * 0.7;
    const isBull = close >= open;
    const color = isBull ? '#10b981' : '#ef4444';

    const yHigh = getY(high);
    const yLow = getY(low);
    const yOpen = getY(open);
    const yClose = getY(close);

    const bodyY = Math.min(yOpen, yClose);
    const bodyH = Math.max(2, Math.abs(yClose - yOpen));

    // Wick
    candleSvg += `<line x1="${x + bodyW / 2}" y1="${yHigh}" x2="${x + bodyW / 2}" y2="${yLow}" stroke="${color}" stroke-width="1.5"/>`;
    // Body
    candleSvg += `<rect x="${x}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="${color}" rx="1"/>`;
  });

  // Price axis labels
  let axisSvg = '';
  const steps = 6;
  for (let s = 0; s <= steps; s++) {
    const p = minPrice + (priceRange * s) / steps;
    const y = getY(p);
    axisSvg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" stroke="#1e293b" stroke-dasharray="3,3" stroke-width="1"/>`;
    axisSvg += `<text x="${width - padding.right + 8}" y="${y + 4}" fill="#64748b" font-size="11" font-family="monospace">${p.toFixed(p > 100 ? 2 : 4)}</text>`;
  }

  // Annotations
  let annotationsSvg = '';
  if (levels?.entry) {
    const y = getY(levels.entry);
    annotationsSvg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4,2"/>`;
    annotationsSvg += `<rect x="${width - padding.right}" y="${y - 10}" width="70" height="20" fill="#0284c7" rx="3"/>`;
    annotationsSvg += `<text x="${width - padding.right + 6}" y="${y + 4}" fill="#ffffff" font-size="10" font-weight="bold" font-family="monospace">ENTRY ${levels.entry}</text>`;
  }
  if (levels?.sl) {
    const y = getY(levels.sl);
    annotationsSvg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,2"/>`;
    annotationsSvg += `<rect x="${width - padding.right}" y="${y - 10}" width="70" height="20" fill="#dc2626" rx="3"/>`;
    annotationsSvg += `<text x="${width - padding.right + 12}" y="${y + 4}" fill="#ffffff" font-size="10" font-weight="bold" font-family="monospace">SL ${levels.sl}</text>`;
  }
  if (levels?.tp) {
    const y = getY(levels.tp);
    annotationsSvg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4,2"/>`;
    annotationsSvg += `<rect x="${width - padding.right}" y="${y - 10}" width="70" height="20" fill="#059669" rx="3"/>`;
    annotationsSvg += `<text x="${width - padding.right + 12}" y="${y + 4}" fill="#ffffff" font-size="10" font-weight="bold" font-family="monospace">TP ${levels.tp}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #0b1120;">
    <!-- Background grid -->
    <rect width="${width}" height="${height}" fill="#0b1120"/>
    ${axisSvg}
    ${candleSvg}
    ${annotationsSvg}
    <!-- Header -->
    <rect x="0" y="0" width="${width}" height="45" fill="#080c17" opacity="0.95"/>
    <text x="20" y="28" fill="#f8fafc" font-size="16" font-weight="bold" font-family="sans-serif">${symbol} &bull; ${timeframe}</text>
    <text x="180" y="28" fill="#eab308" font-size="12" font-family="sans-serif" font-weight="600">INSTITUTIONAL AI FEED</text>
    <text x="${width - 150}" y="28" fill="#94a3b8" font-size="12" font-family="sans-serif">AEGIS TERMINAL</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Generate realistic candlestick patterns for the 3 key scenarios
const eurusdCandles: Array<[number, number, number, number]> = [
  [1.0820, 1.0826, 1.0818, 1.0825],
  [1.0825, 1.0832, 1.0823, 1.0830],
  [1.0830, 1.0835, 1.0812, 1.0815], // Liquidity sweep candle
  [1.0815, 1.0845, 1.0814, 1.0842], // Bullish displacement impulse
  [1.0842, 1.0850, 1.0838, 1.0846],
  [1.0846, 1.0852, 1.0840, 1.0843], // Pullback to FVG
  [1.0843, 1.0858, 1.0842, 1.0854],
  [1.0854, 1.0865, 1.0850, 1.0862],
  [1.0862, 1.0870, 1.0858, 1.0868],
  [1.0868, 1.0880, 1.0865, 1.0875],
  [1.0875, 1.0885, 1.0870, 1.0882],
  [1.0882, 1.0890, 1.0878, 1.0885],
];

const xauusdCandles: Array<[number, number, number, number]> = [
  [2742.0, 2748.5, 2741.0, 2747.0],
  [2747.0, 2755.0, 2746.0, 2754.0], // Buy-side sweep to 2755
  [2754.0, 2756.0, 2738.0, 2739.5], // Bearish engulfing displacement
  [2739.5, 2743.0, 2736.0, 2737.0],
  [2737.0, 2741.5, 2735.0, 2736.0], // Retest of supply order block
  [2736.0, 2738.0, 2728.0, 2729.0],
  [2729.0, 2732.0, 2724.0, 2725.5],
  [2725.5, 2728.0, 2720.0, 2722.0],
  [2722.0, 2724.0, 2715.0, 2716.5],
  [2716.5, 2719.0, 2712.0, 2714.0],
];

const btcusdRangeCandles: Array<[number, number, number, number]> = [
  [68200, 68450, 68100, 68350],
  [68350, 68500, 68250, 68300],
  [68300, 68420, 68200, 68380],
  [68380, 68480, 68290, 68310],
  [68310, 68410, 68220, 68390],
  [68390, 68490, 68300, 68320],
  [68320, 68400, 68250, 68360],
  [68360, 68440, 68280, 68330],
  [68330, 68420, 68260, 68370],
];

export const SAMPLE_CHART_FIXTURES: SampleChartFixture[] = [
  {
    id: 'eurusd-smc-bullish',
    title: 'EUR/USD M15 Bullish Order Block & FVG (BUY)',
    instrument: 'EURUSD',
    timeframe: 'M15',
    style: 'Day Trading',
    strategy: 'Smart Money Concepts (SMC)',
    expectedDecision: 'BUY',
    description: 'Clean sell-side liquidity sweep of Asian session lows, followed by an impulsive CHOCH and unmitigated M15 Fair Value Gap.',
    dataUrl: createChartSvg({
      symbol: 'EURUSD',
      timeframe: 'M15',
      candles: eurusdCandles,
      levels: { entry: 1.0845, sl: 1.0818, tp: 1.0895 },
      theme: 'bullish',
    }),
  },
  {
    id: 'xauusd-h1-bearish-sweep',
    title: 'XAU/USD H1 Buy-Side Sweep & Supply Rejection (SELL)',
    instrument: 'XAUUSD',
    timeframe: 'H1',
    style: 'Swing Trading',
    strategy: 'Breakout & Liquidity Sweep',
    expectedDecision: 'SELL',
    description: 'Failed breakout above 2755 resistance creating a double-top liquidity sweep, followed by strong structural displacement downward.',
    dataUrl: createChartSvg({
      symbol: 'XAUUSD',
      timeframe: 'H1',
      candles: xauusdCandles,
      levels: { entry: 2736.0, sl: 2756.5, tp: 2700.0 },
      theme: 'bearish',
    }),
  },
  {
    id: 'btcusd-h4-range-chop',
    title: 'BTC/USD H4 Inside-Range Chop (WAIT / NO TRADE)',
    instrument: 'BTCUSD',
    timeframe: 'H4',
    style: 'Day Trading',
    strategy: 'Price Action & Key Levels',
    expectedDecision: 'WAIT',
    description: 'Compressing low-volume inside range without clean structural displacement or liquidity sweeps. Capital preservation advised.',
    dataUrl: createChartSvg({
      symbol: 'BTCUSD',
      timeframe: 'H4',
      candles: btcusdRangeCandles,
      theme: 'range',
    }),
  },
];

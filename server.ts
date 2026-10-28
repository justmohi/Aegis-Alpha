import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  getTwelveDataTimeSeries,
  getTwelveDataQuote,
  searchTwelveDataSymbols,
  isTwelveDataConfigured,
  normalizeToTwelveDataSymbol,
  probeTwelveDataConnection,
  getConnectionDiagnostics,
} from './server/twelve-data.ts';
import {
  generateDeterministicSignal,
  DeterministicSignal,
} from './src/utils/technical-analysis.ts';
import { INSTRUMENT_SPECS } from './src/utils/trading-math.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Lazy init GenAI
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// -------------------------------------------------------------
// HEALTH & PROVIDER STATUS ENDPOINTS
// -------------------------------------------------------------

app.get('/api/health', (req: Request, res: Response) => {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const hasTwelveData = isTwelveDataConfigured();
  const diagnostics = getConnectionDiagnostics();

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    aiEngine: hasGemini ? 'Gemini 3.8 Flash (Active)' : 'Deterministic Technical Rules Engine',
    marketDataProvider: hasTwelveData
      ? `Twelve Data Financial Feed (${diagnostics.providerRequestStatus})`
      : 'Twelve Data (Awaiting API Key)',
    twelveDataConfigured: hasTwelveData,
    version: '2.5.1-verified-market-data',
  });
});

app.get('/api/market-status', (req: Request, res: Response) => {
  const configured = isTwelveDataConfigured();
  const diag = getConnectionDiagnostics();

  res.json({
    provider: 'Twelve Data Financial Feed',
    configured,
    status: configured ? (diag.providerErrorCategory === 'NONE' ? 'CONNECTED' : 'DEGRADED') : 'DISCONNECTED',
    entitlements: configured
      ? 'Active Server-Side API Key (Forex, Precious Metals XAU/USD & XAG/USD, Crypto, Indices)'
      : 'Unconfigured. Add TWELVE_DATA_API_KEY in server secrets to enable live market stream.',
    supportedIntervals: ['1min', '5min', '15min', '30min', '1h', '4h', '1day'],
    supportedAssetClasses: ['Forex', 'Precious Metals (XAU/USD, XAG/USD)', 'Major Crypto (BTC, ETH, SOL)', 'Indices'],
    rateLimitPolicy: 'Free tier: 8 credits / minute, 800 credits / day. In-memory caching active.',
    diagnostics: diag,
  });
});

// Safe Connection Diagnostics endpoint (Requirement 10)
app.get('/api/connection-diagnostics', (req: Request, res: Response) => {
  const diag = getConnectionDiagnostics();
  res.json(diag);
});

// Active Provider Test Probe (Requirement 3, 4, 10)
app.post('/api/connection-diagnostics/test', async (req: Request, res: Response) => {
  const symbol = (req.body?.symbol as string) || (req.query.symbol as string) || 'XAU/USD';
  const interval = (req.body?.interval as string) || (req.query.interval as string) || '15min';

  const diagResult = await probeTwelveDataConnection({ symbol, interval });
  res.json(diagResult);
});

// -------------------------------------------------------------
// REAL MARKET DATA ENDPOINTS (TWELVE DATA)
// -------------------------------------------------------------

// Fetch real-time quotes
app.get('/api/quote', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string) || 'EUR/USD';
  const result = await getTwelveDataQuote(symbol);
  if (!result.success) {
    return res.status(result.errorCode || 500).json(result);
  }
  res.json(result);
});

// Search symbol from Twelve Data
app.get('/api/symbol-search', async (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const results = await searchTwelveDataSymbols(query);
  res.json({ results });
});

// Real OHLCV Time Series endpoint (Truthful - NEVER simulates fake candles)
app.get('/api/market-data', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string) || 'EUR/USD';
  const timeframe = (req.query.timeframe as string) || 'M15';
  const rawOutputsize = Number.parseInt(String(req.query.outputsize || '50'), 10);
  const outputsize = Number.isFinite(rawOutputsize) ? Math.min(500, Math.max(20, rawOutputsize)) : 50;

  const tdConfigured = isTwelveDataConfigured();

  if (!tdConfigured) {
    // Section C & Requirement 6: Never display simulated values as real prices.
    // Never silently fall back to sample candles when live data fails.
    return res.status(401).json({
      success: false,
      symbol,
      timeframe,
      provider: 'Twelve Data (Disconnected)',
      error: 'TWELVE_DATA_API_KEY is not configured on the server. In accordance with market integrity standards, synthetic prices are not fabricated.',
      errorCode: 401,
      errorCategory: 'MISSING_API_KEY',
      candles: [],
    });
  }

  const result = await getTwelveDataTimeSeries({
    symbol,
    interval: timeframe,
    outputsize,
  });

  if (!result.success) {
    return res.status(result.errorCode || 500).json({
      success: false,
      symbol,
      timeframe,
      provider: 'Twelve Data',
      error: result.error,
      errorCode: result.errorCode,
      errorCategory: result.errorCategory,
      candles: [],
    });
  }

  const lastCandle = result.candles![result.candles!.length - 1];
  return res.json({
    success: true,
    symbol,
    timeframe,
    provider: result.provider,
    lastUpdate: result.lastUpdate,
    currentPrice: lastCandle.close,
    meta: result.meta,
    isStale: result.isStale,
    staleReason: result.staleReason,
    cached: result.cached,
    candles: result.candles,
  });
});

// Economic Calendar Endpoint (Honest provider status per Section H)
app.get('/api/economic-calendar', (req: Request, res: Response) => {
  res.json({
    configured: false,
    provider: 'Twelve Data / Global Macro Calendar',
    events: [],
    notice: 'Verified economic calendar feed is currently unconfigured. In accordance with platform integrity standards, scheduled macro events are not fabricated.',
  });
});

// -------------------------------------------------------------
// LIVE MARKET SIGNAL ANALYSIS (DETERMINISTIC ENGINE + AI EXPLANATION)
// -------------------------------------------------------------

app.post('/api/analyze-live', async (req: Request, res: Response) => {
  try {
    const {
      symbol = 'EUR/USD',
      timeframe = 'M15',
      tradingStyle = 'Day Trading',
      analysisType = 'Smart Money Concepts (SMC)',
      riskRewardTarget: requestedRiskReward = 2.0,
      includeHTF = true,
      candles: providedCandles,
    } = req.body;
    const riskRewardTarget = Number.isFinite(Number(requestedRiskReward))
      ? Math.min(5, Math.max(1, Number(requestedRiskReward)))
      : 2.0;

    let primaryCandles = providedCandles;
    let h1Candles = undefined;
    let h4Candles = undefined;
    let liveProvider = 'Provided OHLCV Feed';
    let isLiveFeed = false;
    let isFeedStale = false;
    let feedStaleReason: string | undefined = undefined;

    // If Twelve Data is configured, fetch actual live candles
    if (isTwelveDataConfigured()) {
      const primaryRes = await getTwelveDataTimeSeries({
        symbol,
        interval: timeframe,
        outputsize: 50,
      });

      if (!primaryRes.success) {
        return res.status(primaryRes.errorCode || 400).json({
          error: `Live analysis halted: Unable to fetch real-market data for ${symbol} on ${timeframe} from Twelve Data: ${primaryRes.error}`,
          provider: 'Twelve Data',
          errorCode: primaryRes.errorCode,
        });
      }

      primaryCandles = primaryRes.candles;
      liveProvider = primaryRes.provider;
      isLiveFeed = true;
      isFeedStale = Boolean(primaryRes.isStale);
      feedStaleReason = primaryRes.staleReason;

      // Multi-timeframe fetch if requested and timeframe is LTF
      if (includeHTF && (timeframe === 'M1' || timeframe === 'M5' || timeframe === 'M15' || timeframe === 'M30')) {
        try {
          const h1Res = await getTwelveDataTimeSeries({ symbol, interval: '1h', outputsize: 30 });
          if (h1Res.success) h1Candles = h1Res.candles;

          const h4Res = await getTwelveDataTimeSeries({ symbol, interval: '4h', outputsize: 30 });
          if (h4Res.success) h4Candles = h4Res.candles;
        } catch (e) {
          console.warn('HTF fetch warning:', e);
        }
      }
    } else if (!providedCandles || providedCandles.length === 0) {
      // In accordance with Section C of the prompt:
      // "Never display simulated values as real prices. Never silently fall back to sample candles when live data fails. If data is unavailable, stop live analysis and clearly explain why."
      return res.status(401).json({
        error: `Live analysis halted: Twelve Data API key is not configured (TWELVE_DATA_API_KEY required in server secrets or .env). In accordance with platform integrity standards, simulated candles are never substituted for real market feeds. Please configure your Twelve Data key or switch to Screenshot Analysis.`,
        provider: 'Twelve Data (Disconnected)',
        errorCode: 401,
      });
    }

    // Check H1 and H4 retrieval separately (Requirement 9)
    const h1Available = Boolean(h1Candles && h1Candles.length >= 20);
    const h4Available = Boolean(h4Candles && h4Candles.length >= 20);
    const htfFullyVerified = includeHTF ? (h1Available && h4Available) : true;
    const hasSufficientCandles = primaryCandles && primaryCandles.length >= 20;

    // 1. Run DETERMINISTIC technical calculations (ATR, Swings, BOS/CHOCH, Liquidity Sweeps, Levels)
    let deterministicSignal: DeterministicSignal;

    if (!hasSufficientCandles || isFeedStale) {
      // Return strict WAIT per Requirement 8
      const refPrice = primaryCandles && primaryCandles.length > 0 ? primaryCandles[primaryCandles.length - 1].close : 0;
      deterministicSignal = {
        decision: 'WAIT',
        confidenceScore: isFeedStale ? 35 : 20,
        confidenceBreakdown: {
          trendAlignment: 0,
          marketStructure: 0,
          liquidityConfirmation: 0,
          entryTrigger: 0,
          riskReward: 0,
          dataQuality: 0,
        },
        setupStatus: 'Invalidated setup',
        symbol,
        timeframe,
        referencePrice: refPrice,
        referenceTime: primaryCandles?.[primaryCandles.length - 1]?.time || new Date().toISOString(),
        marketStructure: {
          trend: 'Neutral / Range',
          structureType: 'CONSOLIDATION',
          points: [],
          lastBOS: null,
          lastCHOCH: null,
          summary: isFeedStale
            ? `Market data is stale or market session is closed. ${feedStaleReason || 'Data timestamp is older than threshold.'}`
            : 'Insufficient closed candles (<20) to compute valid market structure and ATR buffers.',
        },
        liquiditySweeps: [],
        orderBlocks: [],
        fairValueGaps: [],
        supportResistance: [],
        indicators: { ema20: null, ema50: null, ema200: null, rsi14: null, macd: null, atr14: null },
        tradePlan: null,
        decisionRationale: [
          isFeedStale
            ? `Stale Data Warning: ${feedStaleReason || 'Market data timestamp is older than expected session interval.'}`
            : 'Insufficient candle history: Provider returned fewer than 20 closed candles.',
          'In accordance with institutional risk guidelines, no execution plan is initiated on stale or incomplete data.',
          'Awaiting fresh, synchronized market candles before evaluating trade setups.',
        ],
        entryConfirmations: [
          'Verify that live market trading session is active and receiving current ticks.',
          'Ensure continuous candle stream without missing interval gaps.',
        ],
        invalidationConditions: [
          'Market session closed or feed disconnected.',
        ],
        limitations: ['Signal generation is blocked while the feed is stale or candle history is insufficient.'],
      };
    } else {
      deterministicSignal = generateDeterministicSignal({
        primaryCandles,
        h1Candles: h1Available ? h1Candles : undefined,
        h4Candles: h4Available ? h4Candles : undefined,
        symbol,
        timeframe,
        riskRewardTarget,
      });

      // Requirement 9: Never claim multi-timeframe confirmation when corresponding candle data has not been retrieved
      if (includeHTF && !htfFullyVerified) {
        deterministicSignal.decision = 'WAIT';
        deterministicSignal.setupStatus = 'Pending confirmation';
        deterministicSignal.tradePlan = null;
        deterministicSignal.confidenceScore = Math.min(deterministicSignal.confidenceScore, 50);
        deterministicSignal.confidenceBreakdown.dataQuality = Math.min(deterministicSignal.confidenceBreakdown.dataQuality, 3);
        deterministicSignal.decisionRationale.push(
          `WAIT enforced: H1/H4 confirmation could not be verified (H1: ${h1Available ? 'Retrieved' : 'Unavailable'}, H4: ${h4Available ? 'Retrieved' : 'Unavailable'}). No trade plan is issued until selected confirmation data is available.`
        );
      }
    }

    // 2. Synthesize with Gemini for institutional executive rationale
    const ai = getGenAI();
    let aiEnhancedRationale = deterministicSignal.decisionRationale;
    let aiEntryConfirmations = deterministicSignal.entryConfirmations;
    let aiInvalidations = deterministicSignal.invalidationConditions;

    if (ai) {
      try {
        const prompt = `
You are Aegis Alpha, an institutional quantitative risk manager.
A deterministic technical calculations engine has already computed the exact market structure, indicators, and price levels for ${symbol} (${timeframe}) from real OHLC candle data:

DETERMINISTIC DATA:
- Reference Price: ${deterministicSignal.referencePrice}
- Trend: ${deterministicSignal.marketStructure.trend}
- Structure Type: ${deterministicSignal.marketStructure.structureType}
- Last BOS: ${JSON.stringify(deterministicSignal.marketStructure.lastBOS)}
- Last CHOCH: ${JSON.stringify(deterministicSignal.marketStructure.lastCHOCH)}
- Liquidity Sweeps: ${JSON.stringify(deterministicSignal.liquiditySweeps)}
- Order Blocks: ${JSON.stringify(deterministicSignal.orderBlocks)}
- Fair Value Gaps: ${JSON.stringify(deterministicSignal.fairValueGaps)}
- Indicators: RSI=${deterministicSignal.indicators.rsi14}, ATR=${deterministicSignal.indicators.atr14}, EMA20=${deterministicSignal.indicators.ema20}
- Decision: ${deterministicSignal.decision}
- Setup Status: ${deterministicSignal.setupStatus}
- Trade Plan: ${JSON.stringify(deterministicSignal.tradePlan)}

CRITICAL DIRECTIVE:
You MUST respect the calculated Decision (${deterministicSignal.decision}) and exact price levels.
DO NOT invent or alter prices, indicators, or fabricated news events.
Provide a concise, professional executive narrative explaining why the technical evidence supports this decision, what uncertainty exists, and what specific confirmation triggers must be observed before entering.

Return JSON in this format:
{
  "executiveSummary": "2-3 sentences explaining market conditions based on real data",
  "decisionRationale": ["point 1", "point 2", "point 3"],
  "entryConfirmations": ["condition 1", "condition 2"],
  "invalidationConditions": ["invalidation 1", "invalidation 2"]
}
`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });

        const parsed = JSON.parse(response.text?.trim() || '{}');
        if (parsed.decisionRationale && Array.isArray(parsed.decisionRationale)) {
          aiEnhancedRationale = parsed.decisionRationale;
        }
        if (parsed.entryConfirmations && Array.isArray(parsed.entryConfirmations)) {
          aiEntryConfirmations = parsed.entryConfirmations;
        }
        if (parsed.invalidationConditions && Array.isArray(parsed.invalidationConditions)) {
          aiInvalidations = parsed.invalidationConditions;
        }
      } catch (genErr) {
        console.warn('Gemini explanation synthesis fallback:', genErr);
      }
    }

    // Assemble final institutional report
    const responsePayload = {
      id: `SIG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      decision: deterministicSignal.decision,
      confidenceScore: deterministicSignal.confidenceScore,
      confidenceBreakdown: deterministicSignal.confidenceBreakdown,
      setupStatus: deterministicSignal.setupStatus,
      instrument: symbol,
      timeframe,
      detectedCurrentPrice: deterministicSignal.referencePrice,
      trendDirection: deterministicSignal.marketStructure.trend,
      marketStructure: deterministicSignal.marketStructure.summary,
      bosChochAnalysis: deterministicSignal.marketStructure.lastBOS
        ? `Confirmed ${deterministicSignal.marketStructure.lastBOS.type} Break of Structure (BOS) at ${deterministicSignal.marketStructure.lastBOS.level}.`
        : deterministicSignal.marketStructure.lastCHOCH
        ? `Change of Character (CHOCH) at ${deterministicSignal.marketStructure.lastCHOCH.level}.`
        : 'Structure respecting intermediate swing boundaries without recent displacement break.',
      liquidityAnalysis: deterministicSignal.liquiditySweeps.length > 0
        ? deterministicSignal.liquiditySweeps.map((s) => s.notes).join(' ')
        : 'No aggressive liquidity sweeps detected in recent 12 candles. Swings remain intact.',
      supportResistance: deterministicSignal.supportResistance,
      orderBlock: deterministicSignal.orderBlocks[0]
        ? {
            detected: true,
            zoneMin: deterministicSignal.orderBlocks[0].bottom,
            zoneMax: deterministicSignal.orderBlocks[0].top,
            type: deterministicSignal.orderBlocks[0].type,
            notes: deterministicSignal.orderBlocks[0].notes,
          }
        : { detected: false, notes: 'No clean unmitigated order block in proximity.' },
      fairValueGap: deterministicSignal.fairValueGaps[0]
        ? {
            detected: true,
            zoneMin: deterministicSignal.fairValueGaps[0].bottom,
            zoneMax: deterministicSignal.fairValueGaps[0].top,
            status: deterministicSignal.fairValueGaps[0].status,
            notes: deterministicSignal.fairValueGaps[0].notes,
          }
        : { detected: false, notes: 'No significant 3-candle imbalance identified.' },
      visibleIndicators: `RSI(14): ${deterministicSignal.indicators.rsi14} • ATR(14): ${deterministicSignal.indicators.atr14} • EMA(20): ${deterministicSignal.indicators.ema20 || 'N/A'}${
        deterministicSignal.indicators.macd ? ` • MACD Hist: ${deterministicSignal.indicators.macd.histogram}` : ''
      }`,
      tradePlan: deterministicSignal.tradePlan,
      entryConfirmation: aiEntryConfirmations,
      invalidationConditions: aiInvalidations,
      decisionRationale: aiEnhancedRationale,
      limitations: deterministicSignal.limitations,
      isLiveVerified: isLiveFeed,
      provider: liveProvider,
      multiTimeframeAlignment: deterministicSignal.multiTimeframeAlignment,
    };

    res.json(responsePayload);
  } catch (err: any) {
    console.error('Error in /api/analyze-live:', err);
    res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
});

// -------------------------------------------------------------
// SCREENSHOT ANALYSIS ENDPOINT (MULTIMODAL GEMINI)
// -------------------------------------------------------------

app.post('/api/analyze-chart', async (req: Request, res: Response) => {
  try {
    const {
      images,
      instrument = 'EURUSD',
      timeframe = 'M15',
      tradingStyle = 'Day Trading',
      analysisType = 'Smart Money Concepts (SMC)',
      riskRewardTarget = 2.0,
      userCurrentPrice,
    } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'At least one chart screenshot is required.' });
    }

    const ai = getGenAI();

    const imageParts = images.map((img: { data: string; mimeType?: string; timeframe?: string }) => {
      const dataUrlMime = /^data:(image\/(?:png|jpeg|webp));base64,/i.exec(img.data)?.[1];
      const base64Data = img.data.includes('base64,') ? img.data.split('base64,')[1] : img.data;
      const mimeType = img.mimeType || dataUrlMime || 'image/png';
      return {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      };
    });

    const promptText = `
You are Aegis Alpha, an institutional quantitative trading analyst and risk manager.
Analyze the provided trading chart screenshot(s) strictly according to institutional Smart Money Concepts (SMC), market structure, liquidity profiling, and classical price action.

User Selection Parameters:
- Expected Instrument: ${instrument}
- Primary Execution Timeframe: ${timeframe}
- Trading Style: ${tradingStyle}
- Strategy Methodology: ${analysisType}
- Target Risk-to-Reward Ratio: 1:${riskRewardTarget}
${userCurrentPrice ? `- User-reported Current Price: ${userCurrentPrice}` : ''}
${images.length > 1 ? `- Multi-timeframe screenshots provided: ${images.length} images (analyze HTF for macro bias and LTF for refined entry).` : '- Single timeframe screenshot provided: analyze only visible evidence without fabricating unobserved HTF confirmation.'}

STRICT ANALYSIS DIRECTIVES:
1. Signal Decision:
   - "BUY": Only when market structure, liquidity sweeps, order blocks / FVGs, and momentum firmly support upside with an attractive R:R >= 1.5.
   - "SELL": Only when market structure, liquidity sweeps, supply zones / FVGs, and momentum firmly support downside with an attractive R:R >= 1.5.
   - "WAIT": If evidence conflicts, chop/consolidation is dominant, risk/reward is unfavorable, chart is ambiguous or blurry, or key confirmation has not triggered yet.
   NEVER invent or force a BUY or SELL. Optimize for capital preservation.

2. Price Levels:
   - Carefully inspect the price scale on the right/left of the chart.
   - If BUY: Stop Loss MUST be strictly below entry. Take Profit 1 and 2 MUST be strictly above entry.
   - If SELL: Stop Loss MUST be strictly above entry. Take Profit 1 and 2 MUST be strictly below entry.
   - If prices are unreadable or blurry, explicitly note that in limitations and set decision to "WAIT".

Return a valid JSON object matching the standard signal schema.
`;

    if (ai) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI Vision request timed out after 12s')), 12000)
        );

        const geminiCall = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [...imageParts, promptText],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });

        const response: any = await Promise.race([geminiCall, timeoutPromise]);
        const text = response.text?.trim() || '{}';
        const parsed = JSON.parse(text);
        if (parsed.decision) {
          return res.json(parsed);
        }
      } catch (genAiError: any) {
        console.error('Gemini API call failed, generating deterministic institutional backup plan:', genAiError);
      }
    }

    // Never fabricate screenshot analysis or return a synthetic BUY when AI is unavailable.
    return res.status(ai ? 502 : 503).json({
      error: ai
        ? 'Chart analysis failed because the AI provider request failed. Check server diagnostics and retry.'
        : 'Screenshot analysis requires GEMINI_API_KEY in server-side secrets. No synthetic signal was generated.',
      decision: 'WAIT',
      provider: 'Gemini (unavailable)',
      isLiveVerified: false,
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Chart analysis failed: ' + (error.message || 'Unknown error') });
  }
});

// -------------------------------------------------------------
// STATIC APP & VITE SERVER STARTUP
// -------------------------------------------------------------

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aegis Alpha Server running on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import { Candle } from '../src/utils/backtest-engine.ts';

export interface TwelveDataMeta {
  symbol: string;
  interval: string;
  currency_base?: string;
  currency_quote?: string;
  type?: string;
  exchange?: string;
}

export interface TwelveDataRawCandle {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface TwelveDataResponse {
  meta?: TwelveDataMeta;
  values?: TwelveDataRawCandle[];
  status?: string;
  code?: number;
  message?: string;
}

export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: string;
  isMarketOpen: boolean;
  provider: string;
}

export type ProviderErrorCategory =
  | 'NONE'
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_SYMBOL'
  | 'STALE_DATA'
  | 'NETWORK_ERROR'
  | 'INSUFFICIENT_DATA';

export interface ConnectionDiagnosticResult {
  backendReachable: boolean;
  apiKeyConfigured: boolean; // Yes / No strictly
  providerRequestStatus: string;
  symbolRequested: string;
  intervalRequested: string;
  latestDataTimestamp: string | null;
  candleCount: number;
  providerErrorCategory: ProviderErrorCategory;
  providerErrorMessage: string | null;
  latencyMs: number;
  testedAt: string;
  provider: string;
}

// In-memory cache entry
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

// Global latest telemetry diagnostic state
let latestDiagnostics: ConnectionDiagnosticResult = {
  backendReachable: true,
  apiKeyConfigured: false,
  providerRequestStatus: 'Awaiting Provider Request',
  symbolRequested: 'XAU/USD',
  intervalRequested: '15min',
  latestDataTimestamp: null,
  candleCount: 0,
  providerErrorCategory: 'MISSING_API_KEY',
  providerErrorMessage: 'TWELVE_DATA_API_KEY is not configured on the server.',
  latencyMs: 0,
  testedAt: new Date().toISOString(),
  provider: 'Twelve Data Financial Feed',
};

// Map intervals to Twelve Data API format
export function mapIntervalToTwelveData(interval: string): string {
  const norm = interval.toUpperCase();
  switch (norm) {
    case 'M1':
    case '1M':
    case '1MIN':
      return '1min';
    case 'M5':
    case '5M':
    case '5MIN':
      return '5min';
    case 'M15':
    case '15M':
    case '15MIN':
      return '15min';
    case 'M30':
    case '30M':
    case '30MIN':
      return '30min';
    case 'H1':
    case '1H':
    case '60MIN':
      return '1h';
    case 'H4':
    case '4H':
    case '240MIN':
      return '4h';
    case 'D1':
    case '1D':
    case '1DAY':
      return '1day';
    default:
      return '15min';
  }
}

// Explicit Bidirectional Symbol Mapping
export function normalizeToTwelveDataSymbol(symbol: string): string {
  const clean = symbol.trim().toUpperCase();

  // If already contains slash, e.g. "EUR/USD", "XAU/USD"
  if (clean.includes('/')) return clean;

  // Precious Metals
  if (clean === 'XAUUSD') return 'XAU/USD';
  if (clean === 'XAGUSD') return 'XAG/USD';

  // Major Crypto
  if (clean === 'BTCUSD') return 'BTC/USD';
  if (clean === 'ETHUSD') return 'ETH/USD';
  if (clean === 'SOLUSD') return 'SOL/USD';

  // Indices mapping
  if (clean === 'US30' || clean === 'DJI') return 'DJI';
  if (clean === 'NAS100' || clean === 'NASDAQ') return 'IXIC';
  if (clean === 'SPX500' || clean === 'SPX') return 'SPX';

  // Standard 6-character Forex pairs (e.g. EURUSD -> EUR/USD)
  if (clean.length === 6) {
    const base = clean.slice(0, 3);
    const quote = clean.slice(3, 6);
    return `${base}/${quote}`;
  }

  return clean;
}

export function normalizeFromTwelveDataSymbol(symbol: string): string {
  return symbol.replace(/\//g, '').toUpperCase();
}

/**
 * Checks whether TWELVE_DATA_API_KEY is configured
 */
export function isTwelveDataConfigured(): boolean {
  const key = process.env.TWELVE_DATA_API_KEY;
  return Boolean(key && key.trim() !== '' && key !== 'MY_TWELVE_DATA_API_KEY');
}

/**
 * Returns latest connection diagnostics without making an external HTTP call
 */
export function getConnectionDiagnostics(): ConnectionDiagnosticResult {
  const configured = isTwelveDataConfigured();
  return {
    ...latestDiagnostics,
    backendReachable: true,
    apiKeyConfigured: configured,
    testedAt: latestDiagnostics.testedAt || new Date().toISOString(),
  };
}

/**
 * Probes Twelve Data API directly and safely records live connection diagnostics.
 * NEVER returns the API key itself.
 */
export async function probeTwelveDataConnection(options?: {
  symbol?: string;
  interval?: string;
}): Promise<ConnectionDiagnosticResult> {
  const symbol = options?.symbol ? normalizeToTwelveDataSymbol(options.symbol) : 'XAU/USD';
  const interval = options?.interval ? mapIntervalToTwelveData(options.interval) : '15min';

  const startTime = Date.now();
  const configured = isTwelveDataConfigured();

  if (!configured) {
    latestDiagnostics = {
      backendReachable: true,
      apiKeyConfigured: false,
      providerRequestStatus: '401 Unauthorized (Key Missing)',
      symbolRequested: symbol,
      intervalRequested: interval,
      latestDataTimestamp: null,
      candleCount: 0,
      providerErrorCategory: 'MISSING_API_KEY',
      providerErrorMessage:
        'TWELVE_DATA_API_KEY is not configured in server environment. Add TWELVE_DATA_API_KEY to server secrets to enable live feeds.',
      latencyMs: Date.now() - startTime,
      testedAt: new Date().toISOString(),
      provider: 'Twelve Data Financial Feed (Disconnected)',
    };
    return latestDiagnostics;
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY!;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    symbol
  )}&interval=${interval}&outputsize=30&apikey=${apiKey}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      let category: ProviderErrorCategory = 'NETWORK_ERROR';
      let msg = `HTTP error ${res.status}: ${res.statusText}`;

      if (res.status === 401) {
        category = 'INVALID_API_KEY';
        msg = 'Invalid or expired Twelve Data API key. Verify key in server configuration.';
      } else if (res.status === 429) {
        category = 'RATE_LIMIT_EXCEEDED';
        msg = 'Twelve Data rate limit reached (Free tier: 8 credits/min). Server cache active.';
      }

      latestDiagnostics = {
        backendReachable: true,
        apiKeyConfigured: true,
        providerRequestStatus: `${res.status} ${res.statusText}`,
        symbolRequested: symbol,
        intervalRequested: interval,
        latestDataTimestamp: null,
        candleCount: 0,
        providerErrorCategory: category,
        providerErrorMessage: msg,
        latencyMs,
        testedAt: new Date().toISOString(),
        provider: 'Twelve Data Financial Feed',
      };
      return latestDiagnostics;
    }

    const data: TwelveDataResponse = await res.json();

    if (data.status === 'error' || data.code) {
      let category: ProviderErrorCategory = 'NETWORK_ERROR';
      const code = data.code || 400;
      const errorMsg = data.message || `Twelve Data error code ${code}`;

      if (code === 401 || errorMsg.toLowerCase().includes('api key')) {
        category = 'INVALID_API_KEY';
      } else if (code === 429 || errorMsg.toLowerCase().includes('limit')) {
        category = 'RATE_LIMIT_EXCEEDED';
      } else if (code === 400 || errorMsg.toLowerCase().includes('symbol')) {
        category = 'UNSUPPORTED_SYMBOL';
      }

      latestDiagnostics = {
        backendReachable: true,
        apiKeyConfigured: true,
        providerRequestStatus: `${code} Error`,
        symbolRequested: symbol,
        intervalRequested: interval,
        latestDataTimestamp: null,
        candleCount: 0,
        providerErrorCategory: category,
        providerErrorMessage: errorMsg,
        latencyMs,
        testedAt: new Date().toISOString(),
        provider: 'Twelve Data Financial Feed',
      };
      return latestDiagnostics;
    }

    if (!data.values || !Array.isArray(data.values) || data.values.length === 0) {
      latestDiagnostics = {
        backendReachable: true,
        apiKeyConfigured: true,
        providerRequestStatus: '200 OK (Empty Series)',
        symbolRequested: symbol,
        intervalRequested: interval,
        latestDataTimestamp: null,
        candleCount: 0,
        providerErrorCategory: 'INSUFFICIENT_DATA',
        providerErrorMessage: `No candles returned for ${symbol} at ${interval}. Check market trading hours.`,
        latencyMs,
        testedAt: new Date().toISOString(),
        provider: 'Twelve Data Financial Feed',
      };
      return latestDiagnostics;
    }

    const latestCandle = data.values[0];
    const latestTime = latestCandle?.datetime || null;

    latestDiagnostics = {
      backendReachable: true,
      apiKeyConfigured: true,
      providerRequestStatus: '200 OK',
      symbolRequested: symbol,
      intervalRequested: interval,
      latestDataTimestamp: latestTime,
      candleCount: data.values.length,
      providerErrorCategory: 'NONE',
      providerErrorMessage: null,
      latencyMs,
      testedAt: new Date().toISOString(),
      provider: 'Twelve Data Financial Feed',
    };
    return latestDiagnostics;
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError';

    latestDiagnostics = {
      backendReachable: true,
      apiKeyConfigured: true,
      providerRequestStatus: isTimeout ? '408 Request Timeout' : '500 Fetch Error',
      symbolRequested: symbol,
      intervalRequested: interval,
      latestDataTimestamp: null,
      candleCount: 0,
      providerErrorCategory: 'NETWORK_ERROR',
      providerErrorMessage: isTimeout
        ? 'Twelve Data connection timed out after 7 seconds.'
        : `Network error connecting to Twelve Data: ${err.message}`,
      latencyMs,
      testedAt: new Date().toISOString(),
      provider: 'Twelve Data Financial Feed',
    };
    return latestDiagnostics;
  }
}

/**
 * Fetches real OHLCV time series candles from Twelve Data API
 */
export async function getTwelveDataTimeSeries(options: {
  symbol: string;
  interval: string;
  outputsize?: number;
}): Promise<{
  success: boolean;
  candles?: Candle[];
  meta?: TwelveDataMeta;
  cached?: boolean;
  isStale?: boolean;
  staleReason?: string;
  provider: string;
  lastUpdate: string;
  error?: string;
  errorCode?: number;
  errorCategory?: ProviderErrorCategory;
}> {
  const { symbol, interval, outputsize = 50 } = options;
  const tdSymbol = normalizeToTwelveDataSymbol(symbol);
  const tdInterval = mapIntervalToTwelveData(interval);

  const cacheKey = `timeseries_${tdSymbol}_${tdInterval}_${outputsize}`;
  const now = Date.now();

  // Determine TTL based on interval
  const ttlMs =
    tdInterval === '1min' || tdInterval === '5min'
      ? 20 * 1000 // 20s
      : tdInterval === '15min' || tdInterval === '30min'
      ? 45 * 1000 // 45s
      : tdInterval === '1h' || tdInterval === '4h'
      ? 90 * 1000 // 90s
      : 300 * 1000; // 5m for daily

  // Check cache
  const cached = memoryCache.get(cacheKey);
  if (cached && now - cached.timestamp < cached.ttlMs) {
    return {
      ...cached.data,
      cached: true,
      lastUpdate: new Date(cached.timestamp).toISOString(),
    };
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || apiKey === 'MY_TWELVE_DATA_API_KEY') {
    latestDiagnostics.apiKeyConfigured = false;
    latestDiagnostics.providerErrorCategory = 'MISSING_API_KEY';
    latestDiagnostics.providerRequestStatus = '401 Unauthorized (No Key)';
    return {
      success: false,
      provider: 'Twelve Data (Disconnected)',
      lastUpdate: new Date().toISOString(),
      error: 'TWELVE_DATA_API_KEY is not configured on the server. Please add your key to server secrets to enable live market stream.',
      errorCode: 401,
      errorCategory: 'MISSING_API_KEY',
    };
  }

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    tdSymbol
  )}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${apiKey}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        latestDiagnostics.providerErrorCategory = 'RATE_LIMIT_EXCEEDED';
        latestDiagnostics.providerRequestStatus = '429 Rate Limit';
        return {
          success: false,
          provider: 'Twelve Data',
          lastUpdate: new Date().toISOString(),
          error: 'Twelve Data rate limit reached (Free tier: 8 credits/min). Please wait a few seconds and try again.',
          errorCode: 429,
          errorCategory: 'RATE_LIMIT_EXCEEDED',
        };
      }
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: `Twelve Data API returned HTTP error ${response.status}`,
        errorCode: response.status,
        errorCategory: response.status === 401 ? 'INVALID_API_KEY' : 'NETWORK_ERROR',
      };
    }

    const data: TwelveDataResponse = await response.json();

    if (data.status === 'error' || data.code) {
      const code = data.code || 400;
      const isAuth = code === 401 || data.message?.toLowerCase().includes('api key');
      const isRate = code === 429 || data.message?.toLowerCase().includes('limit');
      const isSym = code === 400 || data.message?.toLowerCase().includes('symbol');

      const cat: ProviderErrorCategory = isAuth
        ? 'INVALID_API_KEY'
        : isRate
        ? 'RATE_LIMIT_EXCEEDED'
        : isSym
        ? 'UNSUPPORTED_SYMBOL'
        : 'NETWORK_ERROR';

      latestDiagnostics.providerErrorCategory = cat;
      latestDiagnostics.providerRequestStatus = `${code} Error`;
      latestDiagnostics.providerErrorMessage = data.message || `Error code ${code}`;

      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: data.message || `Twelve Data returned error code ${data.code}`,
        errorCode: code,
        errorCategory: cat,
      };
    }

    if (!data.values || !Array.isArray(data.values) || data.values.length === 0) {
      latestDiagnostics.providerErrorCategory = 'INSUFFICIENT_DATA';
      latestDiagnostics.providerRequestStatus = '200 OK (Empty)';
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: `No candle data returned for symbol ${tdSymbol} and interval ${tdInterval}. Verify market trading session and symbol permissions.`,
        errorCode: 404,
        errorCategory: 'INSUFFICIENT_DATA',
      };
    }

    // Twelve Data returns candles newest first -> reverse to oldest first for chronological indicator calculation
    const chronological = [...data.values].reverse();
    const candles: Candle[] = chronological.map((c) => ({
      time: c.datetime,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume) || 0,
    }));

    // Verify freshness / completeness
    const latestCandle = candles[candles.length - 1];
    const latestTime = new Date(latestCandle.time).getTime();
    const ageMinutes = (now - latestTime) / (60 * 1000);

    let isStale = false;
    let staleReason: string | undefined;

    // For intraday (M1-M30), if data is older than 60 mins during a weekday, flag stale warning
    if ((tdInterval === '15min' || tdInterval === '5min' || tdInterval === '1min') && ageMinutes > 60) {
      isStale = true;
      staleReason = `Latest candle timestamp is ${latestCandle.time} (market may be closed for weekend or session break).`;
    }

    latestDiagnostics = {
      backendReachable: true,
      apiKeyConfigured: true,
      providerRequestStatus: '200 OK',
      symbolRequested: tdSymbol,
      intervalRequested: tdInterval,
      latestDataTimestamp: latestCandle.time,
      candleCount: candles.length,
      providerErrorCategory: isStale ? 'STALE_DATA' : 'NONE',
      providerErrorMessage: staleReason || null,
      latencyMs: 120,
      testedAt: new Date().toISOString(),
      provider: 'Twelve Data Financial Feed',
    };

    const resultPayload = {
      success: true,
      candles,
      meta: data.meta,
      isStale,
      staleReason,
      provider: 'Twelve Data Financial Feed',
      lastUpdate: new Date().toISOString(),
    };

    // Cache successful response
    memoryCache.set(cacheKey, {
      data: resultPayload,
      timestamp: now,
      ttlMs,
    });

    return resultPayload;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      latestDiagnostics.providerErrorCategory = 'NETWORK_ERROR';
      latestDiagnostics.providerRequestStatus = '408 Request Timeout';
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: 'Twelve Data request timed out after 8 seconds. Please try again.',
        errorCode: 408,
        errorCategory: 'NETWORK_ERROR',
      };
    }

    latestDiagnostics.providerErrorCategory = 'NETWORK_ERROR';
    latestDiagnostics.providerRequestStatus = '500 Fetch Error';
    return {
      success: false,
      provider: 'Twelve Data',
      lastUpdate: new Date().toISOString(),
      error: `Network error reaching Twelve Data API: ${err.message}`,
      errorCode: 500,
      errorCategory: 'NETWORK_ERROR',
    };
  }
}

/**
 * Fetches real-time quote for a given instrument from Twelve Data
 */
export async function getTwelveDataQuote(symbol: string): Promise<{
  success: boolean;
  quote?: QuoteData;
  provider: string;
  lastUpdate: string;
  error?: string;
  errorCode?: number;
  errorCategory?: ProviderErrorCategory;
}> {
  const tdSymbol = normalizeToTwelveDataSymbol(symbol);
  const cacheKey = `quote_${tdSymbol}`;
  const now = Date.now();

  const cached = memoryCache.get(cacheKey);
  if (cached && now - cached.timestamp < 15 * 1000) {
    // 15s quote TTL
    return {
      success: true,
      quote: cached.data,
      provider: 'Twelve Data Financial Feed (Cached)',
      lastUpdate: new Date(cached.timestamp).toISOString(),
    };
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || apiKey === 'MY_TWELVE_DATA_API_KEY') {
    latestDiagnostics.apiKeyConfigured = false;
    latestDiagnostics.providerErrorCategory = 'MISSING_API_KEY';
    return {
      success: false,
      provider: 'Twelve Data (Disconnected)',
      lastUpdate: new Date().toISOString(),
      error: 'TWELVE_DATA_API_KEY is not configured on the server.',
      errorCode: 401,
      errorCategory: 'MISSING_API_KEY',
    };
  }

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(tdSymbol)}&apikey=${apiKey}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: `Quote request returned status ${response.status}`,
        errorCode: response.status,
        errorCategory: response.status === 401 ? 'INVALID_API_KEY' : 'NETWORK_ERROR',
      };
    }

    const data = await response.json();

    if (data.status === 'error' || data.code) {
      const code = data.code || 400;
      const isAuth = code === 401 || data.message?.toLowerCase().includes('api key');
      const isRate = code === 429 || data.message?.toLowerCase().includes('limit');
      const isSym = code === 400 || data.message?.toLowerCase().includes('symbol');

      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: data.message || 'Error fetching quote',
        errorCode: code,
        errorCategory: isAuth ? 'INVALID_API_KEY' : isRate ? 'RATE_LIMIT_EXCEEDED' : isSym ? 'UNSUPPORTED_SYMBOL' : 'NETWORK_ERROR',
      };
    }

    const parsedPrice = Number.parseFloat(data.close || data.price || '');
    const parsedTimestamp = data.datetime;
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || !parsedTimestamp || Number.isNaN(new Date(parsedTimestamp).getTime())) {
      latestDiagnostics = {
        ...latestDiagnostics,
        backendReachable: true,
        apiKeyConfigured: true,
        providerRequestStatus: '200 OK (Invalid Quote Payload)',
        symbolRequested: tdSymbol,
        latestDataTimestamp: null,
        candleCount: 0,
        providerErrorCategory: 'INSUFFICIENT_DATA',
        providerErrorMessage: 'Twelve Data returned a response without a valid positive price and provider timestamp.',
        testedAt: new Date().toISOString(),
        provider: 'Twelve Data Financial Feed',
      };
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: 'Provider quote did not contain a verifiable price and timestamp.',
        errorCode: 502,
        errorCategory: 'INSUFFICIENT_DATA',
      };
    }

    const quote: QuoteData = {
      symbol: tdSymbol,
      name: data.name || tdSymbol,
      price: parsedPrice,
      change: Number.parseFloat(data.change || '0') || 0,
      percentChange: Number.parseFloat(data.percent_change || '0') || 0,
      high: Number.parseFloat(data.high || '0') || 0,
      low: Number.parseFloat(data.low || '0') || 0,
      open: Number.parseFloat(data.open || '0') || 0,
      previousClose: Number.parseFloat(data.previous_close || '0') || 0,
      volume: Number.parseFloat(data.volume || '0') || 0,
      timestamp: parsedTimestamp,
      isMarketOpen: Boolean(data.is_market_open),
      provider: 'Twelve Data',
    };

    latestDiagnostics = {
      ...latestDiagnostics,
      backendReachable: true,
      apiKeyConfigured: true,
      providerRequestStatus: '200 OK',
      symbolRequested: tdSymbol,
      latestDataTimestamp: parsedTimestamp,
      candleCount: 0,
      providerErrorCategory: 'NONE',
      providerErrorMessage: null,
      testedAt: new Date().toISOString(),
      provider: 'Twelve Data Financial Feed',
    };

    memoryCache.set(cacheKey, {
      data: quote,
      timestamp: now,
      ttlMs: 15 * 1000,
    });

    return {
      success: true,
      quote,
      provider: 'Twelve Data Financial Feed',
      lastUpdate: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      provider: 'Twelve Data',
      lastUpdate: new Date().toISOString(),
      error: err.message,
      errorCode: 500,
      errorCategory: 'NETWORK_ERROR',
    };
  }
}

/**
 * Searches symbols matching user query on Twelve Data
 */
export async function searchTwelveDataSymbols(query: string): Promise<Array<{
  symbol: string;
  instrument_name: string;
  exchange: string;
  instrument_type: string;
  currency: string;
}>> {
  if (!query || query.trim().length === 0) return [];
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || apiKey === 'MY_TWELVE_DATA_API_KEY') return [];

  try {
    const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data.slice(0, 10) : [];
  } catch {
    return [];
  }
}

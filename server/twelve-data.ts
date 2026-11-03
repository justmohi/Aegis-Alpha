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
  | 'NOT_TESTED'
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

// Coalesce identical provider HTTP requests made concurrently by different UI
// components/endpoints. Each caller receives its own clone so response bodies
// can be parsed independently. This does not change cache TTLs or API behavior.
const inFlightProviderRequests = new Map<string, Promise<Response>>();

export async function fetchProviderResponse(url: string, init?: RequestInit): Promise<Response> {
  const key = `${init?.method || 'GET'}:${url}`;
  let pending = inFlightProviderRequests.get(key);

  if (!pending) {
    pending = fetch(url, init);
    inFlightProviderRequests.set(key, pending);
    const tracked = pending;
    void tracked.finally(() => {
      // Keep the completed response briefly so near-simultaneous callers that
      // arrive just after the network resolves do not issue a duplicate call.
      setTimeout(() => {
        if (inFlightProviderRequests.get(key) === tracked) {
          inFlightProviderRequests.delete(key);
        }
      }, 1000);
    }).catch(() => {
      if (inFlightProviderRequests.get(key) === tracked) {
        inFlightProviderRequests.delete(key);
      }
    });
  }

  const response = await pending;
  return response.clone();
}

/** Assess candle freshness using provider bar-open timestamps and interval-aware thresholds. */
export function assessCandleFreshness(
  latestTimestamp: string,
  interval: string,
  nowMs: number = Date.now(),
): { isStale: boolean; ageMinutes: number; thresholdMinutes: number; reason?: string } {
  const intervalMinutes = INTERVAL_MINUTES[interval] || 15;
  const timestampMs = new Date(latestTimestamp).getTime();
  const thresholdMinutes = intervalMinutes * 2 + 2;
  if (!Number.isFinite(timestampMs)) {
    return { isStale: true, ageMinutes: Number.POSITIVE_INFINITY, thresholdMinutes, reason: 'Latest candle timestamp is invalid.' };
  }
  const ageMinutes = Math.max(0, (nowMs - timestampMs) / 60000);
  const isStale = ageMinutes > thresholdMinutes;
  return {
    isStale, ageMinutes, thresholdMinutes,
    reason: isStale ? `Latest candle opened at ${latestTimestamp}; data is approximately ${Math.round(ageMinutes)} minutes old (limit ${thresholdMinutes} minutes).` : undefined,
  };
}

const INTERVAL_MINUTES: Record<string, number> = {
  '1min': 1, '5min': 5, '15min': 15, '30min': 30, '1h': 60, '4h': 240, '1day': 1440,
};

/** Reject malformed, unordered, future-dated, or internally inconsistent OHLC candles. */
function validateCandles(candles: Candle[], nowMs: number): string | null {
  if (!Array.isArray(candles) || candles.length < 2) return 'Provider returned fewer than two candles.';
  let previousTime = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    const time = new Date(candle.time).getTime();
    const values = [candle.open, candle.high, candle.low, candle.close];
    if (!Number.isFinite(time) || time > nowMs + 5 * 60 * 1000) return 'Candle timestamp is invalid or unexpectedly in the future.';
    if (time <= previousTime) return 'Candle timestamps are not strictly chronological.';
    if (!values.every((value) => Number.isFinite(value) && value > 0)) return 'Candle contains a non-finite or non-positive OHLC value.';
    if (!Number.isFinite(candle.volume) || candle.volume < 0) return 'Candle contains an invalid negative or non-finite volume.';
    if (candle.high < candle.low || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) {
      return 'Candle OHLC values are internally inconsistent.';
    }
    previousTime = time;
  }
  return null;
}

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
  const awaitingFirstProbe = latestDiagnostics.providerRequestStatus === 'Awaiting Provider Request';
  return {
    ...latestDiagnostics,
    backendReachable: true,
    apiKeyConfigured: configured,
    ...(configured && awaitingFirstProbe ? {
      providerErrorCategory: 'NOT_TESTED' as const,
      providerErrorMessage: null,
    } : {}),
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

    const res = await fetchProviderResponse(url, { signal: controller.signal });
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
    latestDiagnostics = {
      ...latestDiagnostics, backendReachable: true, apiKeyConfigured: isTwelveDataConfigured(),
      providerRequestStatus: '200 OK (Cache)', symbolRequested: tdSymbol, intervalRequested: tdInterval,
      latestDataTimestamp: cached.data.candles?.[cached.data.candles.length - 1]?.time || null,
      candleCount: cached.data.candles?.length || 0,
      providerErrorCategory: cached.data.isStale ? 'STALE_DATA' : 'NONE',
      providerErrorMessage: cached.data.staleReason || null, latencyMs: 0,
      testedAt: new Date().toISOString(), provider: 'Twelve Data Financial Feed (Cached)',
    };
    return { ...cached.data, cached: true, lastUpdate: new Date(cached.timestamp).toISOString() };
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_TWELVE_DATA_API_KEY') {
    latestDiagnostics = { ...latestDiagnostics, apiKeyConfigured: false, providerErrorCategory: 'MISSING_API_KEY',
      providerRequestStatus: '401 Unauthorized (No Key)', symbolRequested: tdSymbol, intervalRequested: tdInterval,
      latestDataTimestamp: null, candleCount: 0, providerErrorMessage: 'TWELVE_DATA_API_KEY is not configured on the server.',
      testedAt: new Date().toISOString(), provider: 'Twelve Data Financial Feed (Disconnected)' };
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

    const response = await fetchProviderResponse(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const category: ProviderErrorCategory = response.status === 401 ? 'INVALID_API_KEY' : response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'NETWORK_ERROR';
      latestDiagnostics = { ...latestDiagnostics, backendReachable: true, apiKeyConfigured: true,
        providerRequestStatus: `${response.status} ${response.statusText}`, symbolRequested: tdSymbol, intervalRequested: tdInterval,
        latestDataTimestamp: null, candleCount: 0, providerErrorCategory: category,
        providerErrorMessage: `Twelve Data API returned HTTP ${response.status}.`, latencyMs: Date.now() - now,
        testedAt: new Date().toISOString(), provider: 'Twelve Data Financial Feed' };
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

    // Validate provider payload before allowing any technical analysis.
    const integrityError = validateCandles(candles, Date.now());
    if (integrityError) {
      latestDiagnostics = {
        ...latestDiagnostics,
        backendReachable: true,
        apiKeyConfigured: true,
        providerRequestStatus: '200 OK (Invalid Candle Series)',
        symbolRequested: tdSymbol,
        intervalRequested: tdInterval,
        latestDataTimestamp: candles[candles.length - 1]?.time || null,
        candleCount: candles.length,
        providerErrorCategory: 'INSUFFICIENT_DATA',
        providerErrorMessage: integrityError,
        testedAt: new Date().toISOString(),
        provider: 'Twelve Data Financial Feed',
      };
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: integrityError,
        errorCode: 502,
        errorCategory: 'INSUFFICIENT_DATA',
      };
    }

    // Verify freshness using the provider's candle-open timestamp.
    const latestCandle = candles[candles.length - 1];
    const freshness = assessCandleFreshness(latestCandle.time, tdInterval, now);
    const isStale = freshness.isStale;
    const staleReason = freshness.reason;

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
      latencyMs: Date.now() - now,
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
    latestDiagnostics = { ...latestDiagnostics, backendReachable: true, apiKeyConfigured: true,
      symbolRequested: tdSymbol, intervalRequested: tdInterval, latestDataTimestamp: null, candleCount: 0,
      providerErrorCategory: 'NETWORK_ERROR', providerErrorMessage: err.name === 'AbortError'
        ? 'Twelve Data request timed out after 8 seconds.' : `Network error reaching Twelve Data: ${err.message}`,
      providerRequestStatus: err.name === 'AbortError' ? '408 Request Timeout' : '500 Fetch Error',
      latencyMs: Date.now() - now, testedAt: new Date().toISOString(), provider: 'Twelve Data Financial Feed' };
    if (err.name === 'AbortError') {
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
 * Normalize Twelve Data quote timestamps without interpreting timezone-less
 * exchange-local datetime strings as server-local/UTC timestamps.
 * The provider's Unix timestamp is authoritative when present.
 */
export function parseTwelveDataQuoteTimestamp(
  rawTimestamp: unknown,
  rawDatetime: unknown,
): string | null {
  if (rawTimestamp !== null && rawTimestamp !== undefined && String(rawTimestamp).trim() !== '') {
    const numeric = Number(rawTimestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const milliseconds = numeric < 1e12 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  if (typeof rawDatetime !== 'string' || !rawDatetime.trim()) return null;
  const value = rawDatetime.trim();
  // Only parse datetime fallback when it explicitly carries UTC or an offset.
  // "YYYY-MM-DD HH:mm:ss" is exchange-local and ambiguous without timezone.
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  if (!hasExplicitTimezone) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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
  if (cached && now - cached.timestamp < 60 * 1000) {
    // 60s quote TTL to reduce provider credit consumption
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

    const response = await fetchProviderResponse(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const category: ProviderErrorCategory =
        response.status === 401 ? 'INVALID_API_KEY' :
        response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'NETWORK_ERROR';
      latestDiagnostics = {
        ...latestDiagnostics,
        backendReachable: true,
        apiKeyConfigured: true,
        providerRequestStatus: `${response.status} ${response.statusText}`,
        symbolRequested: tdSymbol,
        intervalRequested: 'quote',
        latestDataTimestamp: null,
        candleCount: 0,
        providerErrorCategory: category,
        providerErrorMessage: response.status === 429
          ? 'Twelve Data quote endpoint rate limit reached. Reduce polling and wait before probing again.'
          : response.status === 401
            ? 'Twelve Data rejected the configured API key.'
            : `Twelve Data quote request failed with HTTP ${response.status}.`,
        latencyMs: Date.now() - now,
        testedAt: new Date().toISOString(),
        provider: 'Twelve Data Financial Feed',
      };
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: `Quote request returned status ${response.status}`,
        errorCode: response.status,
        errorCategory: category,
      };
    }

    const data = await response.json();

    if (data.status === 'error' || data.code) {
      const code = data.code || 400;
      const isAuth = code === 401 || data.message?.toLowerCase().includes('api key');
      const isRate = code === 429 || data.message?.toLowerCase().includes('limit');
      const isSym = code === 400 || data.message?.toLowerCase().includes('symbol');

      const category: ProviderErrorCategory = isAuth ? 'INVALID_API_KEY' : isRate ? 'RATE_LIMIT_EXCEEDED' : isSym ? 'UNSUPPORTED_SYMBOL' : 'NETWORK_ERROR';
      latestDiagnostics = {
        ...latestDiagnostics,
        backendReachable: true,
        apiKeyConfigured: true,
        providerRequestStatus: `${code} Provider Error`,
        symbolRequested: tdSymbol,
        intervalRequested: 'quote',
        latestDataTimestamp: null,
        candleCount: 0,
        providerErrorCategory: category,
        providerErrorMessage: String(data.message || 'Twelve Data quote request failed.').slice(0, 240),
        latencyMs: Date.now() - now,
        testedAt: new Date().toISOString(),
        provider: 'Twelve Data Financial Feed',
      };
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: data.message || 'Error fetching quote',
        errorCode: code,
        errorCategory: category,
      };
    }

    const parsedPrice = Number.parseFloat(data.close || data.price || '');
    const parsedTimestamp = parseTwelveDataQuoteTimestamp(data.timestamp, data.datetime);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || !parsedTimestamp) {
      latestDiagnostics = {
        ...latestDiagnostics,
        backendReachable: true,
        apiKeyConfigured: true,
        providerRequestStatus: '200 OK (Invalid Quote Payload)',
        symbolRequested: tdSymbol,
        latestDataTimestamp: null,
        candleCount: 0,
        providerErrorCategory: 'INSUFFICIENT_DATA',
        providerErrorMessage: 'Twelve Data quote must include a positive price and a verifiable Unix timestamp (or an ISO datetime with an explicit timezone).',
        testedAt: new Date().toISOString(),
        provider: 'Twelve Data Financial Feed',
      };
      return {
        success: false,
        provider: 'Twelve Data',
        lastUpdate: new Date().toISOString(),
        error: 'Provider quote did not contain a verifiable price and timezone-safe timestamp. Unix timestamp is preferred.',
        errorCode: 502,
        errorCategory: 'INSUFFICIENT_DATA',
      };
    }

    const quoteAgeMs = Date.now() - Date.parse(parsedTimestamp);
    const quoteStaleLimitMs = 2 * 60 * 1000;
    if (quoteAgeMs < -5000 || quoteAgeMs > quoteStaleLimitMs) {
      latestDiagnostics = {
        ...latestDiagnostics, backendReachable: true, apiKeyConfigured: true,
        providerRequestStatus: '200 OK (Stale Quote)', symbolRequested: tdSymbol,
        latestDataTimestamp: parsedTimestamp, candleCount: 0,
        providerErrorCategory: 'STALE_DATA',
        providerErrorMessage: `Quote timestamp is ${Math.round(Math.max(0, quoteAgeMs) / 1000)} seconds old; maximum allowed age is 120 seconds.`,
        latencyMs: Date.now() - now, testedAt: new Date().toISOString(), provider: 'Twelve Data Financial Feed',
      };
      return {
        success: false, provider: 'Twelve Data Financial Feed',
        lastUpdate: new Date().toISOString(),
        error: 'Provider quote is stale or unexpectedly future-dated. No current price was accepted.',
        errorCode: 502, errorCategory: 'STALE_DATA',
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
      latencyMs: Date.now() - now,
      testedAt: new Date().toISOString(),
      provider: 'Twelve Data Financial Feed',
    };

    memoryCache.set(cacheKey, {
      data: quote,
      timestamp: now,
      ttlMs: 60 * 1000,
    });

    return {
      success: true,
      quote,
      provider: 'Twelve Data Financial Feed',
      lastUpdate: new Date().toISOString(),
    };
  } catch (err: any) {
    latestDiagnostics = {
      ...latestDiagnostics,
      backendReachable: true,
      apiKeyConfigured: true,
      providerRequestStatus: err?.name === 'AbortError' ? '408 Quote Timeout' : '500 Quote Network Error',
      symbolRequested: tdSymbol,
      intervalRequested: 'quote',
      latestDataTimestamp: null,
      candleCount: 0,
      providerErrorCategory: 'NETWORK_ERROR',
      providerErrorMessage: err?.name === 'AbortError'
        ? 'Twelve Data quote request timed out.'
        : 'Network error while requesting a Twelve Data quote.',
      latencyMs: Date.now() - now,
      testedAt: new Date().toISOString(),
      provider: 'Twelve Data Financial Feed',
    };
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
    const res = await fetchProviderResponse(url);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data.slice(0, 10) : [];
  } catch {
    return [];
  }
}

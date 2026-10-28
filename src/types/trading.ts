export type SignalDecision = 'BUY' | 'SELL' | 'WAIT';
export type SetupStatus = 'Early setup' | 'Pending confirmation' | 'Confirmed setup' | 'Invalidated setup';
export type TrendDirection = 'Strong Bullish' | 'Bullish' | 'Neutral / Range' | 'Bearish' | 'Strong Bearish';
export type TradingStyle = 'Scalping' | 'Day Trading' | 'Swing Trading';
export type AnalysisType =
  | 'Smart Money Concepts (SMC)'
  | 'Price Action & Key Levels'
  | 'Trend Following & Momentum'
  | 'Breakout & Liquidity Sweep';

export interface ConfidenceBreakdown {
  trendAlignment: number; // max 20
  marketStructure: number; // max 20
  liquidityConfirmation: number; // max 20
  entryTrigger: number; // max 15
  riskReward: number; // max 15
  dataQuality: number; // max 10
}

export interface SupportResistanceLevel {
  level: number;
  type: 'Support' | 'Resistance';
  strength: 'Major' | 'Minor';
  notes: string;
}

export interface OrderBlockZone {
  detected: boolean;
  zoneMin?: number | null;
  zoneMax?: number | null;
  type?: 'Bullish' | 'Bearish' | 'None';
  notes?: string;
}

export interface FairValueGapZone {
  detected: boolean;
  zoneMin?: number | null;
  zoneMax?: number | null;
  status?: 'Unmitigated' | 'Partially Filled' | 'Mitigated' | 'None';
  notes?: string;
}

export interface TradePlan {
  entryZone: {
    min: number;
    max: number;
    optimal: number;
  };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatioTP1: number;
  riskRewardRatioTP2: number;
  stopDistancePips: number;
  atrBufferPips?: number;
}

export interface SignalAnalysisResult {
  id?: string;
  timestamp?: string;
  decision: SignalDecision;
  confidenceScore: number;
  confidenceBreakdown: ConfidenceBreakdown;
  setupStatus: SetupStatus;
  instrument: string;
  timeframe: string;
  detectedCurrentPrice: number | null;
  trendDirection: TrendDirection;
  marketStructure: string;
  bosChochAnalysis: string;
  liquidityAnalysis: string;
  supportResistance: SupportResistanceLevel[];
  orderBlock: OrderBlockZone;
  fairValueGap: FairValueGapZone;
  visibleIndicators: string;
  tradePlan: TradePlan | null;
  entryConfirmation: string[];
  invalidationConditions: string[];
  decisionRationale: string[];
  limitations: string[];
  isLiveVerified: boolean;
  provider?: string;
  isStale?: boolean;
  staleReason?: string;
  chartImageBase64?: string;
  multiTimeframeAlignment?: {
    h4Trend?: string;
    h1Trend?: string;
    m15Setup?: string;
    concordant: boolean;
  };
}

export type TradeOutcome = 'PENDING' | 'HIT_TP1' | 'HIT_TP2' | 'STOPPED_OUT' | 'BREAKEVEN' | 'INVALIDATED';

export interface JournalEntry {
  id: string;
  createdAt: string;
  instrument: string;
  timeframe: string;
  tradingStyle: string;
  analysisType: string;
  decision: SignalDecision;
  confidenceScore: number;
  currentPrice: number | null;
  tradePlan: TradePlan | null;
  rationale: string[];
  outcome: TradeOutcome;
  realizedPnlUSD?: number;
  realizedR?: number;
  userNotes?: string;
  screenshotThumbnail?: string;
}

export interface UploadedImage {
  id: string;
  data: string; // base64
  name: string;
  timeframe: string;
  label: string; // e.g. "Primary Execution (M15)", "HTF Confirmation (H1)"
}

export interface SampleChartFixture {
  id: string;
  title: string;
  instrument: string;
  timeframe: string;
  style: TradingStyle;
  strategy: AnalysisType;
  expectedDecision: SignalDecision;
  description: string;
  dataUrl: string;
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

export interface TwelveDataStatus {
  provider: string;
  configured: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';
  entitlements: string;
  supportedIntervals: string[];
  supportedAssetClasses: string[];
  rateLimitPolicy: string;
  diagnostics?: ConnectionDiagnosticResult;
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

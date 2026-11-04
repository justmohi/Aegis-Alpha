import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, Clock, Zap, WifiOff } from 'lucide-react';
import { QuoteData, TwelveDataStatus } from '../types/trading.ts';

interface TickerItem {
  symbol: string;
  name: string;
  price: number | null;
  change: string | null;
  isUp: boolean;
  spread: string;
  timestamp: string | null;
  provider: string | null;
}

const INITIAL_WATCHLIST: TickerItem[] = [
  { symbol: 'EUR/USD', name: 'Euro', price: null, change: null, isUp: true, spread: '0.6', timestamp: null, provider: null },
  { symbol: 'GBP/USD', name: 'Cable', price: null, change: null, isUp: true, spread: '0.9', timestamp: null, provider: null },
  { symbol: 'USD/JPY', name: 'Yen', price: null, change: null, isUp: false, spread: '0.8', timestamp: null, provider: null },
  { symbol: 'XAU/USD', name: 'Gold', price: null, change: null, isUp: true, spread: '1.8', timestamp: null, provider: null },
  { symbol: 'BTC/USD', name: 'Bitcoin', price: null, change: null, isUp: true, spread: '12.0', timestamp: null, provider: null },
];

export const TickerBar: React.FC = () => {
  const [tickers, setTickers] = useState<TickerItem[]>(INITIAL_WATCHLIST);
  const [providerStatus, setProviderStatus] = useState<string>('Twelve Data (Checking...)');
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [lastFeedUpdate, setLastFeedUpdate] = useState<string | null>(null);

  useEffect(() => {
    // Check market status and diagnostic state
    fetch('/api/market-status')
      .then((res) => res.json())
      .then((data: TwelveDataStatus) => {
        const configured = Boolean(data.configured);
        setIsConfigured(configured);

        if (configured) {
          setProviderStatus('Twelve Data Financial Feed (Live)');
          // Fetch actual quotes for key pairs
          const symbolsToFetch = ['EUR/USD', 'XAU/USD'];

          symbolsToFetch.forEach((sym) => {
            fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`)
              .then((r) => r.json())
              .then((qRes) => {
                if (qRes.success && qRes.quote) {
                  const q: QuoteData = qRes.quote;
                  setLastFeedUpdate(q.timestamp);
                  setTickers((prev) =>
                    prev.map((t) =>
                      t.symbol === sym
                        ? {
                            ...t,
                            price: q.price,
                            change: `${q.percentChange >= 0 ? '+' : ''}${q.percentChange.toFixed(2)}%`,
                            isUp: q.change >= 0,
                            timestamp: q.timestamp,
                            provider: q.provider,
                          }
                        : t
                    )
                  );
                }
              })
              .catch(() => {});
          });
        } else {
          setProviderStatus('Twelve Data Disconnected (Awaiting Key)');
        }
      })
      .catch(() => {
        setProviderStatus('Twelve Data Disconnected (Backend Offline)');
      });
  }, []);

  return (
    <div className="bg-[#060911] border-b border-[#141d30] py-1.5 px-4 text-xs font-mono overflow-x-auto no-scrollbar">
      <div className="max-w-7xl mx-auto flex items-center justify-between min-w-[750px]">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-1.5 text-slate-500">
            <span
              className={`w-2 h-2 rounded-full ${
                isConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-[11px] text-slate-400 font-sans font-medium uppercase tracking-wider">
              {isConfigured ? 'VERIFIED FEED' : 'FEED DISCONNECTED'}
            </span>
          </div>

          <div className="flex items-center space-x-5">
            {tickers.map((item) => (
              <div key={item.symbol} className="flex items-center space-x-1.5" title={item.timestamp ? `Verified ${item.provider || 'Twelve Data'} @ ${item.timestamp}` : 'Awaiting live provider tick'}>
                <span className="text-slate-400 font-semibold">{item.symbol}</span>
                {item.price !== null ? (
                  <>
                    <span className="text-slate-100 font-bold">
                      {item.price > 1000
                        ? item.price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })
                        : item.price.toFixed(item.symbol.includes('JPY') ? 3 : 5)}
                    </span>
                    {item.change && (
                      <span
                        className={`flex items-center text-[10px] ${
                          item.isUp ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {item.isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {item.change}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-600 font-mono text-[11px] italic bg-[#0c1322] px-1.5 py-0.5 rounded border border-slate-800/60">
                    --.--
                  </span>
                )}
                <span className="text-[9px] text-slate-600">sp {item.spread}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-4 text-slate-500 text-[11px]">
          <div className="flex items-center space-x-1">
            {isConfigured ? (
              <Zap className="w-3 h-3 text-emerald-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-amber-400" />
            )}
            <span className={isConfigured ? 'text-slate-300' : 'text-amber-400/90'}>
              Feed: {providerStatus}
            </span>
          </div>
          {lastFeedUpdate && (
            <div className="flex items-center space-x-1 text-slate-400">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{lastFeedUpdate.includes('T') ? new Date(lastFeedUpdate).toLocaleTimeString() : lastFeedUpdate}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

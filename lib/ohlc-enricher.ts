import { fetchOptionChain } from './nse-fetch';
import { determineATM, getStepSize, selectStrikesAroundATM } from './calculations';

export interface OHLCMap {
  /** Map key: `${strikePrice}_CE` or `${strikePrice}_PE` (expiry-agnostic for nearest expiry) */
  [key: string]: { high: number; low: number; ltp: number };
}

function parseToIIFLDate(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    return dateStr;
  }
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = months[parts[1].toLowerCase()] ?? '01';
    const year = parts[2];
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}

function fetchWithTimeout(url: string, options: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fetch(url, { ...options, signal: ctrl.signal } as any).finally(() => clearTimeout(t));
}

async function fetchIIFLOptionDetail(
  symbol: string,
  expiry: string,
  callPut: 'ce' | 'pe',
  strikePrice: number,
  retries = 2
): Promise<any> {
  const url = `https://www.indiainfoline.com/cms-api/v1/public/get-options-detail?symbol=${symbol}&expiry=${expiry}&callPutIndicator=${callPut}&strikePrice=${strikePrice}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, attempt * 150));
    }
    try {
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        }
      }, 5000);

      if (!res.ok) continue;
      const json = await res.json();
      if (json?.data?.overview) {
        return json.data.overview;
      }
    } catch (err) {
      console.warn('[ohlc-enricher] fetchIIFLOptionDetail failed:', err);
    }
  }
  return null;
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      try {
        results[currentIndex] = await tasks[currentIndex]();
      } catch (err) {
        console.warn('[ohlc-enricher] Task failed:', err);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Fetch real High/Low for option contracts from India Infoline.
 */
export async function fetchContractOHLC(
  symbol: string,
  selectedStrikes?: number[],
  expiryDateStr?: string
): Promise<{
  ohlcMap: OHLCMap;
  underlyingValue: number;
  nearestExpiry: string;
}> {
  let strikesToQuery = selectedStrikes;
  let targetExpiry = expiryDateStr;
  let underlyingValue = 0;

  // Fallback: If not provided, fetch the option chain to determine nearest expiry and strikes
  if (!targetExpiry || !strikesToQuery || strikesToQuery.length === 0) {
    const data = await fetchOptionChain(symbol);
    const underlying = data.records.underlyingValue;
    underlyingValue = underlying;
    const allStrikes = data.records.data;
    const strikePrices = [...new Set(allStrikes.map(d => d.strikePrice))].sort((a, b) => a - b);
    const atmStrike = determineATM(underlying, strikePrices);
    const stepSize = getStepSize(symbol);
    
    // Select ATM ± 15 strikes to cover all possible ranges (max range is 15)
    const selectedRaw = selectStrikesAroundATM(allStrikes, atmStrike, 15, stepSize);
    strikesToQuery = selectedRaw.map(s => s.strikePrice);
    targetExpiry = allStrikes[0]?.expiryDate || data.records.expiryDates[0] || '';
  }

  const ohlcMap: OHLCMap = {};
  const iiflDate = parseToIIFLDate(targetExpiry);
  const lowercaseSymbol = symbol.toLowerCase();

  const tasks: (() => Promise<void>)[] = [];

  for (const strike of strikesToQuery) {
    // CE Request
    tasks.push(async () => {
      const data = await fetchIIFLOptionDetail(lowercaseSymbol, iiflDate, 'ce', strike);
      if (data) {
        const high = Number(data.highprice ?? 0);
        const low = Number(data.lowprice ?? 0);
        const ltp = Number(data.ltp ?? 0);
        ohlcMap[`${strike}_CE`] = { high, low, ltp };
        if (data.SpotPrice) {
          underlyingValue = Number(data.SpotPrice);
        }
      }
    });

    // PE Request
    tasks.push(async () => {
      const data = await fetchIIFLOptionDetail(lowercaseSymbol, iiflDate, 'pe', strike);
      if (data) {
        const high = Number(data.highprice ?? 0);
        const low = Number(data.lowprice ?? 0);
        const ltp = Number(data.ltp ?? 0);
        ohlcMap[`${strike}_PE`] = { high, low, ltp };
        if (data.SpotPrice) {
          underlyingValue = Number(data.SpotPrice);
        }
      }
    });
  }

  // Use higher concurrency (6) for faster parallel fetching.
  await runWithConcurrency(tasks, 6);

  return {
    ohlcMap,
    underlyingValue,
    nearestExpiry: targetExpiry
  };
}

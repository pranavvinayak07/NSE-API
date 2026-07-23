import type { NSEApiResponse, OptionData, StrikeData } from '@/types/option-chain';
import { NSE } from 'nse-bse-api';
import path from 'path';
import os from 'os';

let nseInstance: any = null;

function getNSEClient() {
  if (!nseInstance) {
    const downloadDir = path.join(os.tmpdir(), 'nse-downloads');
    nseInstance = new NSE(downloadDir, { server: true });
  }
  return nseInstance;
}

function mapOptionData(opt: any): OptionData {
  return {
    strikePrice: Number(opt.strikePrice ?? 0),
    expiryDate: opt.expiryDate ?? '',
    highPrice: Number(opt.highPrice ?? 0),
    lowPrice: Number(opt.lowPrice ?? 0),
    openPrice: Number(opt.openPrice ?? 0),
    closePrice: Number(opt.closePrice ?? 0),
    lastPrice: Number(opt.lastPrice ?? 0),
    change: Number(opt.change ?? 0),
    pChange: Number(opt.pChange ?? opt.pchange ?? 0),
    totalTradedVolume: Number(opt.totalTradedVolume ?? 0),
    openInterest: Number(opt.openInterest ?? 0),
    changeinOpenInterest: Number(opt.changeinOpenInterest ?? 0),
    pchangeinOpenInterest: Number(opt.pchangeinOpenInterest ?? opt.pChangeInOpenInterest ?? 0),
    impliedVolatility: Number(opt.impliedVolatility ?? 0),
    totalBuyQuantity: Number(opt.totalBuyQuantity ?? 0),
    totalSellQuantity: Number(opt.totalSellQuantity ?? 0),
    bidQty: Number(opt.buyQuantity1 ?? opt.bidQty ?? 0),
    bidprice: Number(opt.buyPrice1 ?? opt.bidprice ?? 0),
    askQty: Number(opt.sellQuantity1 ?? opt.askQty ?? 0),
    askPrice: Number(opt.sellPrice1 ?? opt.askPrice ?? 0),
    underlyingValue: Number(opt.underlyingValue ?? 0),
  };
}

function mapStrikeData(strike: any): StrikeData {
  const expiryDate = strike.expiryDate || strike.CE?.expiryDate || strike.PE?.expiryDate || '';
  return {
    strikePrice: Number(strike.strikePrice ?? 0),
    expiryDate,
    CE: strike.CE ? mapOptionData(strike.CE) : undefined,
    PE: strike.PE ? mapOptionData(strike.PE) : undefined,
  };
}

function mapV3ResponseToNSEApiResponse(data: any): NSEApiResponse {
  const records = data?.records ?? {};
  const filtered = data?.filtered ?? {};

  return {
    records: {
      expiryDates: Array.isArray(records.expiryDates) ? records.expiryDates.map(String) : [],
      data: Array.isArray(records.data) ? records.data.map(mapStrikeData) : [],
      timestamp: records.timestamp ?? '',
      underlyingValue: Number(records.underlyingValue ?? 0),
      strikePrices: Array.isArray(records.strikePrices) ? records.strikePrices.map(Number) : [],
    },
    filtered: {
      expiryDates: Array.isArray(filtered.expiryDates) ? filtered.expiryDates.map(String) : [],
      data: Array.isArray(filtered.data) ? filtered.data.map(mapStrikeData) : [],
      CE: {
        totOI: Number(filtered?.CE?.totOI ?? 0),
        totVol: Number(filtered?.CE?.totVol ?? 0),
      },
      PE: {
        totOI: Number(filtered?.PE?.totOI ?? 0),
        totVol: Number(filtered?.PE?.totVol ?? 0),
      },
    },
  };
}

const FETCH_RETRIES = 3;

/**
 * Generic retry helper with exponential backoff.
 * Delay sequence: 1 s → 2 s → 4 s (doubles each attempt).
 * Exported so callers (e.g. nse.ts) can wrap any async operation.
 */
export async function retry<T>(fn: () => Promise<T>, retries = FETCH_RETRIES): Promise<T> {
  let delay = 1000;
  let lastErr: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) {
        console.warn(
          `[retry] attempt ${i + 1}/${retries} failed, retrying in ${delay}ms:`,
          err instanceof Error ? err.message : String(err),
        );
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2; // exponential backoff
      }
    }
  }

  throw lastErr;
}

export async function fetchOptionChain(symbol: string): Promise<NSEApiResponse> {
  console.log(`[nse-fetch] Starting fetchOptionChain for ${symbol}`);
  return retry(async () => {
    const nse = getNSEClient();
    const rawData = await nse.optionChain(symbol);

    if (!rawData?.records?.data) {
      console.error('[nse-fetch] No option chain data returned from NSE. Raw keys:', Object.keys(rawData || {}));
      throw new Error('No option chain data returned from NSE.');
    }

    const mapped = mapV3ResponseToNSEApiResponse(rawData);
    console.log(`[nse-fetch] fetchOptionChain SUCCESS — spot: ${mapped.records.underlyingValue}, expiries: ${mapped.records.expiryDates.length}, strikes: ${mapped.records.data.length}, timestamp: ${mapped.records.timestamp}`);
    return mapped;
  });
}

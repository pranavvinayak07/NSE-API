import { NextRequest, NextResponse } from 'next/server';
import { fetchOptionChain } from '@/lib/nse-fetch';
import { fetchContractOHLC } from '@/lib/ohlc-enricher';
import { determineATM, getStepSize, selectStrikesAroundATM, processStrikes } from '@/lib/calculations';
import { SYMBOLS, STRIKE_RANGES } from '@/lib/constants';
import type { SymbolType, StrikeRange } from '@/types/option-chain';

function isMarketOpen(): boolean {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const day = ist.getUTCDay();
  const hh = ist.getUTCHours();
  const mm = ist.getUTCMinutes();
  const timeInMinutes = hh * 60 + mm;
  const OPEN_MIN = 9 * 60 + 15;   // 9:15 AM
  const CLOSE_MIN = 15 * 60 + 30; // 3:30 PM
  return day !== 0 && day !== 6 && timeInMinutes >= OPEN_MIN && timeInMinutes < CLOSE_MIN;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol    = (searchParams.get('symbol') ?? 'NIFTY').toUpperCase() as SymbolType;
  const rangeParam = parseInt(searchParams.get('range') ?? '5', 10) as StrikeRange;

  if (!SYMBOLS.map(s => s.value).includes(symbol)) {
    return NextResponse.json({ error: `Invalid symbol: ${symbol}` }, { status: 400 });
  }
  if (!STRIKE_RANGES.map(r => r.value).includes(rangeParam)) {
    return NextResponse.json({ error: `Invalid range: ${rangeParam}` }, { status: 400 });
  }

  try {
    const data            = await fetchOptionChain(symbol);
    const underlyingValue = data.records.underlyingValue;
    const allStrikes      = data.records.data;

    const strikePrices = [...new Set(allStrikes.map(d => d.strikePrice))].sort((a, b) => a - b);
    const atmStrike    = determineATM(underlyingValue, strikePrices);
    const stepSize     = getStepSize(symbol);
    const selectedRawInit = selectStrikesAroundATM(allStrikes, atmStrike, rangeParam, stepSize);
    const strikesToQuery  = selectedRawInit.map(s => s.strikePrice);
    const targetExpiry    = selectedRawInit[0]?.expiryDate || data.records.expiryDates[0] || '';

    let ohlcMap: Record<string, { high: number; low: number; ltp: number }> = {};
    const marketOpen = isMarketOpen();

    if (marketOpen) {
      // During market hours: Use NSE's native high/low prices for each strike premium
      for (const strike of allStrikes) {
        if (strike.CE) {
          ohlcMap[`${strike.strikePrice}_CE`] = {
            high: strike.CE.highPrice,
            low: strike.CE.lowPrice,
            ltp: strike.CE.lastPrice,
          };
        }
        if (strike.PE) {
          ohlcMap[`${strike.strikePrice}_PE`] = {
            high: strike.PE.highPrice,
            low: strike.PE.lowPrice,
            ltp: strike.PE.lastPrice,
          };
        }
      }
    } else {
      // After market close: Fetch historical high/low from IIFL (only for selected strikes)
      try {
        const ohlcResult = await fetchContractOHLC(symbol, strikesToQuery, targetExpiry);
        ohlcMap = ohlcResult.ohlcMap;
      } catch (err: any) {
        console.error('fetchContractOHLC error:', err);
      }
    }

    const enrichedStrikes = allStrikes.map(strike => {
      const ceKey = `${strike.strikePrice}_CE`;
      const peKey = `${strike.strikePrice}_PE`;
      const ceOHLC = ohlcMap[ceKey];
      const peOHLC = ohlcMap[peKey];
      return {
        ...strike,
        CE: strike.CE ? {
          ...strike.CE,
          highPrice: ceOHLC?.high ?? strike.CE.highPrice,
          lowPrice:  ceOHLC?.low  ?? strike.CE.lowPrice,
        } : undefined,
        PE: strike.PE ? {
          ...strike.PE,
          highPrice: peOHLC?.high ?? strike.PE.highPrice,
          lowPrice:  peOHLC?.low  ?? strike.PE.lowPrice,
        } : undefined,
      };
    });

    const selectedRaw = selectStrikesAroundATM(enrichedStrikes, atmStrike, rangeParam, stepSize);

    if (!selectedRaw.length) {
      return NextResponse.json({ error: 'No option chain data available for this range.' }, { status: 404 });
    }

    return NextResponse.json({
      symbol,
      underlyingValue,
      atmStrike,
      strikeCount: selectedRaw.length,
      timestamp: data.records.timestamp || new Date().toISOString(),
      strikes: processStrikes(selectedRaw, atmStrike),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to fetch live market data.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

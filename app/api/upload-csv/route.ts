import { NextRequest, NextResponse } from 'next/server';
import { parseNSECsv } from '@/lib/csv-parser';
import { fetchContractOHLC } from '@/lib/ohlc-enricher';
import { determineATM, getStepSize, selectStrikesAroundATM, processStrikes } from '@/lib/calculations';
import { generateOptionChainExcel } from '@/lib/excel-generator';
import { SYMBOLS } from '@/lib/constants';
import { formatForFilename } from '@/lib/date-utils';
import type { SymbolType, StrikeData } from '@/types/option-chain';

/**
 * POST /api/upload-csv
 *
 * Flow:
 *  1. Parse NSE option chain CSV → get strikes with LTP as placeholder high/low
 *  2. Call NSE quote-derivative API → fetch real High/Low for each contract
 *  3. Merge real OHLC into strike data → use ATM from quote-derivative underlying value
 *  4. Return JSON preview OR XLSX download depending on `mode` field
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file     = formData.get('file')   as File   | null;
    const symbol   = ((formData.get('symbol') as string) ?? 'NIFTY').toUpperCase() as SymbolType;
    const range    = parseInt((formData.get('range')  as string) ?? '5', 10);
    const mode     = (formData.get('mode')   as string) ?? 'preview';

    if (!file) {
      return NextResponse.json({ error: 'No CSV file provided.' }, { status: 400 });
    }
    if (!SYMBOLS.map(s => s.value).includes(symbol)) {
      return NextResponse.json({ error: `Invalid symbol: ${symbol}` }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 2 MB).' }, { status: 400 });
    }

    // ── Step 1: Parse CSV ───────────────────────────────────────────
    const csvText = await file.text();
    let parsed;
    try {
      parsed = parseNSECsv(csvText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse CSV.';
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    // ── Step 2: Fetch real OHLC from NSE quote-derivative API ───────
    let ohlcMap: Awaited<ReturnType<typeof fetchContractOHLC>>['ohlcMap'] = {};
    let liveUnderlyingValue = 0;
    let ohlcFetchFailed = false;

    try {
      const allStrikes = parsed.data.records.data;
      const stepSize = getStepSize(symbol);
      const selectedRawInit = selectStrikesAroundATM(allStrikes, parsed.csvATM, 15, stepSize);
      const strikesToQuery = selectedRawInit.map(s => s.strikePrice);
      const targetExpiry = parsed.expiryDate || '';

      const ohlcResult = await fetchContractOHLC(symbol, strikesToQuery, targetExpiry);
      ohlcMap = ohlcResult.ohlcMap;
      liveUnderlyingValue = ohlcResult.underlyingValue;
    } catch (err) {
      console.warn('[upload-csv] OHLC fetch failed:', err);
      // OHLC fetch failed — proceed with LTP-based placeholder values and note it
      ohlcFetchFailed = true;
    }

    // ── Step 3: Merge real High/Low into parsed strike data ─────────
    const underlyingValue = liveUnderlyingValue || parsed.underlyingValue;

    const enrichedStrikes: StrikeData[] = parsed.data.records.data.map(strike => {
      const ceKey  = `${strike.strikePrice}_CE`;
      const peKey  = `${strike.strikePrice}_PE`;
      const ceOHLC = ohlcMap[ceKey];
      const peOHLC = ohlcMap[peKey];

      return {
        ...strike,
        CE: strike.CE ? {
          ...strike.CE,
          underlyingValue,
          highPrice: ceOHLC?.high ?? strike.CE.highPrice,
          lowPrice:  ceOHLC?.low  ?? strike.CE.lowPrice,
          lastPrice: ceOHLC?.ltp  ?? strike.CE.lastPrice,
        } : strike.CE,
        PE: strike.PE ? {
          ...strike.PE,
          underlyingValue,
          highPrice: peOHLC?.high ?? strike.PE.highPrice,
          lowPrice:  peOHLC?.low  ?? strike.PE.lowPrice,
          lastPrice: peOHLC?.ltp  ?? strike.PE.lastPrice,
        } : strike.PE,
      };
    });

    // ── Step 4: Determine ATM using live underlying value ───────────
    // Prefer live underlying (from quote-derivative) for accuracy.
    // Fall back to CSV ATM from CE-PE LTP parity.
    const strikePrices = enrichedStrikes.map(s => s.strikePrice).sort((a, b) => a - b);
    const atmStrike = underlyingValue > 0
      ? determineATM(underlyingValue, strikePrices)
      : parsed.csvATM;

    const stepSize   = getStepSize(symbol);
    const selectedRaw = selectStrikesAroundATM(enrichedStrikes, atmStrike, range, stepSize);
    const strikes    = processStrikes(selectedRaw.length ? selectedRaw : enrichedStrikes, atmStrike);

    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const ohlcNote  = ohlcFetchFailed ? ' (High/Low approx. from LTP — live fetch unavailable)' : '';

    // ── Download mode: return XLSX ──────────────────────────────────
    if (mode === 'download') {
      const buffer = await generateOptionChainExcel(strikes, {
        symbol, underlyingValue, atmStrike,
        timestamp: `${timestamp} [From CSV${ohlcNote}]`,
        range,
      });

      const filename = `NSE_${symbol}_OptionChain_ATM${range}_${formatForFilename(new Date())}_CSV.xlsx`;
      return new Response(buffer.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control':       'no-store',
          'X-OHLC-Source':       ohlcFetchFailed ? 'ltp-approx' : 'live',
        },
      });
    }

    // ── Preview mode: return JSON ───────────────────────────────────
    return NextResponse.json({
      symbol,
      underlyingValue,
      atmStrike,
      strikeCount: strikes.length,
      timestamp,
      strikes,
      fromCSV: true,
      totalRows: parsed.rowCount,
      ohlcSource: ohlcFetchFailed ? 'ltp-approx' : 'live',
    });

  } catch (err) {
    console.warn('[upload-csv] Failed to process CSV:', err);
    return NextResponse.json({ error: 'Failed to process CSV upload.' }, { status: 500 });
  }
}

import type { NSEApiResponse, StrikeData } from '@/types/option-chain';

/**
 * Parse NSE Option Chain CSV into our internal NSEApiResponse format.
 *
 * NSE CSV column layout (confirmed structure):
 * Row 1: CALLS header / PUTS header (section labels)
 * Row 2: OI | Chng in OI | Volume | IV | LTP | Net Chng | Bid Qty | Bid | Ask | Ask Qty | Strike Price | Bid Qty | Bid | Ask | Ask Qty | Net Chng | LTP | IV | Volume | Chng in OI | OI
 *
 * NOTE: High/Low are NOT in the NSE CSV. This parser stores LTP in both
 * highPrice and lowPrice slots as a placeholder. The upload route enriches
 * them with real OHLC from NSE's quote-derivative API before returning.
 */

function parseNumber(val: string): number {
  const cleaned = val.replace(/[",\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export interface ParseResult {
  data: NSEApiResponse;
  underlyingValue: number;
  rowCount: number;
  /** True ATM strike determined by CE-PE LTP parity */
  csvATM: number;
  /** Expiry date found in the CSV header if any */
  expiryDate: string;
}

export function parseNSECsv(csvText: string): ParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 3) {
    throw new Error('CSV file is too short. Please upload a valid NSE option chain CSV.');
  }

  // ── Find the header row that contains "Strike Price" ─────────────
  let headerRowIndex = -1;
  let headerCols: string[] = [];

  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const cols = splitCSVLine(lines[i]).map(c => c.replace(/"/g, '').toLowerCase().trim());
    if (cols.some(c => c.includes('strike'))) {
      headerRowIndex = i;
      headerCols = cols;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find "Strike Price" column. Please upload a valid NSE option chain CSV.');
  }

  // ── Locate Strike Price column ────────────────────────────────────
  const strikeIdx = headerCols.findIndex(c => c.includes('strike'));
  if (strikeIdx === -1) {
    throw new Error('Strike Price column not found in CSV.');
  }

  // CE columns are to the LEFT of Strike, PE to the RIGHT
  const ceColsBefore = headerCols.slice(0, strikeIdx);
  const peColsAfter  = headerCols.slice(strikeIdx + 1);

  // Helper to find column index within a sub-array (returns absolute index)
  function findAbsIdx(subCols: string[], terms: string[], baseOffset = 0): number {
    const rel = subCols.findIndex(c => terms.some(t => c.includes(t)));
    return rel === -1 ? -1 : rel + baseOffset;
  }

  // CE LTP (in left side — LTP column before Strike)
  const ceLtpIdx = findAbsIdx(ceColsBefore, ['ltp', 'last price', 'lastprice']);

  // PE LTP (in right side — rightmost LTP occurrence)
  const peOffset  = strikeIdx + 1;
  const peLtpRel  = peColsAfter.findIndex(c => c.includes('ltp') || c.includes('last'));
  const peLtpIdx  = peLtpRel === -1 ? -1 : peOffset + peLtpRel;

  if (ceLtpIdx === -1 || peLtpIdx === -1) {
    throw new Error('Could not locate CE/PE LTP columns. Please use the standard NSE option chain CSV download.');
  }

  // ── Try to extract underlying value from pre-header rows ──────────
  let underlyingValue = 0;
  let expiryDate = '';

  for (let i = 0; i < headerRowIndex; i++) {
    const raw  = lines[i];
    const cols = splitCSVLine(raw);

    // Look for patterns like "NIFTY,23556.00" or "Underlying : 23556"
    for (const col of cols) {
      const cleaned = col.replace(/[",\s]/g, '');
      const n = parseFloat(cleaned);
      // Valid underlying values are typically 1000–100000
      if (!isNaN(n) && n > 5000 && n < 100000 && n !== Math.floor(n / 50) * 50) {
        underlyingValue = n;
      }
    }

    // Look for expiry date like "29-05-2025" or "29 May 2025"
    const dateMatch = raw.match(/\d{2}[-\/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{2})[-\/\s]\d{4}/i);
    if (dateMatch && !expiryDate) {
      expiryDate = dateMatch[0];
    }
  }

  // ── Parse data rows ───────────────────────────────────────────────
  interface RawRow {
    strikePrice: number;
    ceLtp: number;
    peLtp: number;
  }

  const rawRows: RawRow[] = [];

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length <= strikeIdx) continue;

    const strikePriceRaw = parseNumber(cols[strikeIdx]);
    if (!strikePriceRaw || strikePriceRaw <= 0) continue;

    const ceLtp = ceLtpIdx !== -1 && cols[ceLtpIdx] ? parseNumber(cols[ceLtpIdx]) : 0;
    const peLtp = peLtpIdx !== -1 && cols[peLtpIdx] ? parseNumber(cols[peLtpIdx]) : 0;

    // Skip completely empty rows (OTM options with no trades)
    if (ceLtp === 0 && peLtp === 0) continue;

    rawRows.push({ strikePrice: strikePriceRaw, ceLtp, peLtp });
  }

  if (rawRows.length === 0) {
    throw new Error('No valid strike data found. Please check the CSV file.');
  }

  rawRows.sort((a, b) => a.strikePrice - b.strikePrice);

  // ── Determine ATM via CE-PE LTP parity ───────────────────────────
  // NOTE: CE-PE parity is UNRELIABLE due to IV skew — e.g. if underlying
  // is 23,550 but skew makes |CE-PE| smallest at 23,700, we pick the wrong ATM.
  // This is only used as a last resort when the live OHLC fetch also fails.
  // When OHLC fetch succeeds, the live underlyingValue overrides this.
  //
  // Better fallback: use the strike where both CE and PE have the most
  // similar LTP-to-strike ratio (rough fair-value proxy), or simply pick
  // the middle strike of the non-zero rows.
  let csvATM = rawRows[Math.floor(rawRows.length / 2)].strikePrice;

  // Try CE-PE parity but only accept it if the difference is very small (< 5 points)
  let minDiff = Infinity;
  let parityATM = csvATM;
  for (const row of rawRows) {
    if (row.ceLtp > 0 && row.peLtp > 0) {
      const diff = Math.abs(row.ceLtp - row.peLtp);
      if (diff < minDiff) {
        minDiff = diff;
        parityATM = row.strikePrice;
      }
    }
  }
  // Only trust parity if the CE and PE are genuinely close (ATM has near-equal premiums)
  // A threshold of 15 points accounts for slight skew while filtering large skew errors
  if (minDiff < 15) {
    csvATM = parityATM;
  }
  // Otherwise fall back to median strike

  // ── If no underlying value found, estimate from ATM ──────────────
  if (!underlyingValue) {
    underlyingValue = csvATM;
  }

  // ── Build NSEApiResponse shape ─────────────────────────────────────
  // High/Low are set to LTP as placeholder — enriched later by OHLC fetch
  const strikesArray: StrikeData[] = rawRows.map(row => ({
    strikePrice: row.strikePrice,
    expiryDate,
    CE: {
      strikePrice: row.strikePrice, expiryDate,
      highPrice: row.ceLtp,  // placeholder — enriched by ohlc-enricher
      lowPrice:  row.ceLtp,  // placeholder
      openPrice: 0, closePrice: 0, lastPrice: row.ceLtp,
      change: 0, pChange: 0, totalTradedVolume: 0,
      openInterest: 0, changeinOpenInterest: 0, pchangeinOpenInterest: 0,
      impliedVolatility: 0, totalBuyQuantity: 0, totalSellQuantity: 0,
      bidQty: 0, bidprice: 0, askQty: 0, askPrice: 0,
      underlyingValue,
    },
    PE: {
      strikePrice: row.strikePrice, expiryDate,
      highPrice: row.peLtp,  // placeholder — enriched by ohlc-enricher
      lowPrice:  row.peLtp,  // placeholder
      openPrice: 0, closePrice: 0, lastPrice: row.peLtp,
      change: 0, pChange: 0, totalTradedVolume: 0,
      openInterest: 0, changeinOpenInterest: 0, pchangeinOpenInterest: 0,
      impliedVolatility: 0, totalBuyQuantity: 0, totalSellQuantity: 0,
      bidQty: 0, bidprice: 0, askQty: 0, askPrice: 0,
      underlyingValue,
    },
  }));

  const strikePrices = strikesArray.map(s => s.strikePrice);

  const apiResponse: NSEApiResponse = {
    records: {
      expiryDates: expiryDate ? [expiryDate] : [],
      data: strikesArray,
      timestamp: new Date().toISOString(),
      underlyingValue,
      strikePrices,
    },
    filtered: {
      expiryDates: expiryDate ? [expiryDate] : [],
      data: strikesArray,
      CE: { totOI: 0, totVol: 0 },
      PE: { totOI: 0, totVol: 0 },
    },
  };

  return {
    data: apiResponse,
    underlyingValue,
    rowCount: strikesArray.length,
    csvATM,
    expiryDate,
  };
}

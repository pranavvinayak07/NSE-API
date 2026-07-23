import type { StrikeData, ProcessedStrike } from '@/types/option-chain';
import { SYMBOLS } from './constants';

/** Formula A = (Call High + Put Low) / 2 */
export function calcFormulaA(callHigh: number, putLow: number): number {
  return (callHigh + putLow) / 2;
}

/** Formula B = (Call Low + Put High) / 2 */
export function calcFormulaB(callLow: number, putHigh: number): number {
  return (callLow + putHigh) / 2;
}

/** Difference = |Formula A - Formula B| */
export function calcDifference(a: number, b: number): number {
  return Math.abs(a - b);
}

/** Average = (Formula A + Formula B) / 2 */
export function calcAverage(a: number, b: number): number {
  return (a + b) / 2;
}

/**
 * Determine ATM strike from underlying value.
 * Finds the strike price closest to the underlying value.
 */
export function determineATM(underlyingValue: number, strikePrices: number[]): number {
  if (!strikePrices.length) return 0;
  return strikePrices.reduce((prev, curr) =>
    Math.abs(curr - underlyingValue) < Math.abs(prev - underlyingValue) ? curr : prev
  );
}

/**
 * Get the step size (spacing between strikes) for a symbol.
 */
export function getStepSize(symbol: string): number {
  return SYMBOLS.find(s => s.value === symbol)?.stepSize ?? 50;
}

/**
 * Select ATM ± range strikes from the raw data array.
 * Returns filtered + sorted strike data.
 */
export function selectStrikesAroundATM(
  data: StrikeData[],
  atmStrike: number,
  range: number,
  stepSize: number
): StrikeData[] {
  const lowerBound = atmStrike - range * stepSize;
  const upperBound = atmStrike + range * stepSize;

  return data
    .filter(d => d.strikePrice >= lowerBound && d.strikePrice <= upperBound)
    .sort((a, b) => a.strikePrice - b.strikePrice);
}

/**
 * Process raw strike data into calculated rows.
 */
export function processStrikes(
  rawStrikes: StrikeData[],
  atmStrike: number
): ProcessedStrike[] {
  return rawStrikes.map(strike => {
    const callHigh = strike.CE?.highPrice ?? 0;
    const callLow  = strike.CE?.lowPrice  ?? 0;
    const putHigh  = strike.PE?.highPrice ?? 0;
    const putLow   = strike.PE?.lowPrice  ?? 0;

    const formulaA   = calcFormulaA(callHigh, putLow);
    const formulaB   = calcFormulaB(callLow, putHigh);
    const difference = calcDifference(formulaA, formulaB);
    const average    = calcAverage(formulaA, formulaB);

    return {
      strikePrice: strike.strikePrice,
      callHigh,
      callLow,
      putHigh,
      putLow,
      formulaA,
      formulaB,
      difference,
      average,
      isATM: strike.strikePrice === atmStrike,
    };
  });
}

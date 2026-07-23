'use client';

import { useRef, useEffect, useState } from 'react';
import type { ProcessedStrike } from '@/types/option-chain';

interface StrikeTableProps {
  strikes: ProcessedStrike[];
  loading: boolean;
  symbol: string;
  fromCSV?: boolean;
}

function fmt(n: number) { return n.toFixed(2); }

const COLUMNS = [
  { key: 'strikePrice', label: 'Strike', align: 'center' },
  { key: 'callLow', label: 'CE Low', align: 'right' },
  { key: 'callHigh', label: 'CE High', align: 'right' },
  { key: 'putLow', label: 'PE Low', align: 'right' },
  { key: 'putHigh', label: 'PE High', align: 'right' },
  { key: 'formulaA', label: 'PE-S', align: 'right' },
  { key: 'formulaB', label: 'CE-S', align: 'right' },
  { key: 'difference', label: 'Difference', align: 'right' },
  { key: 'average', label: 'Average', align: 'right' },
] as const;

type ColKey = typeof COLUMNS[number]['key'];

export function StrikeTable({ strikes, loading, symbol, fromCSV }: StrikeTableProps) {
  const prevStrikesRef = useRef<Record<number, { callLow: number; callHigh: number; putLow: number; putHigh: number }>>({});
  const [increasingCells, setIncreasingCells] = useState<Set<string>>(new Set());

  // Track value increases and apply animation
  useEffect(() => {
    const newIncreasing = new Set<string>();

    strikes.forEach(strike => {
      const key = strike.strikePrice;
      const prev = prevStrikesRef.current[key];

      if (prev) {
        // Check if any price increased
        if (strike.callHigh > prev.callHigh) newIncreasing.add(`${key}_callHigh`);
        if (strike.callLow > prev.callLow) newIncreasing.add(`${key}_callLow`);
        if (strike.putHigh > prev.putHigh) newIncreasing.add(`${key}_putHigh`);
        if (strike.putLow > prev.putLow) newIncreasing.add(`${key}_putLow`);
      }

      // Store current values for next comparison
      prevStrikesRef.current[key] = {
        callLow: strike.callLow,
        callHigh: strike.callHigh,
        putLow: strike.putLow,
        putHigh: strike.putHigh,
      };
    });

    setIncreasingCells(newIncreasing);

    // Clear animation after 600ms to allow re-animation on next increase
    const timer = setTimeout(() => setIncreasingCells(new Set()), 600);
    return () => clearTimeout(timer);
  }, [strikes]);

  if (loading) {
    return (
      <div className="table-container">
        <div className="table-skeleton">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="skeleton-row">
              {Array.from({ length: 9 }).map((_, j) => (
                <div key={j} className="skeleton-cell" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!strikes.length) return null;

  return (
    <div className="table-container">
      <div className="table-header-bar">
        <h2 className="table-title">
          <span className="symbol-badge">{symbol}</span>
          Option Chain Preview
          {fromCSV && (
            <span className="csv-source-badge" title="Data loaded from uploaded CSV">
              📂 CSV
            </span>
          )}
        </h2>
        <p className="table-subtitle">ATM row highlighted in green</p>
      </div>

      <div className="table-scroll">
        <table className="strike-table" role="grid" aria-label={`${symbol} option chain data`}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th key={col.key} style={{ textAlign: col.align }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strikes.map(s => (
              <tr key={s.strikePrice} className={s.isATM ? 'row-atm' : ''}>
                {COLUMNS.map(col => {
                  const raw = s[col.key as ColKey];
                  const val = col.key === 'strikePrice' ? String(raw) : fmt(Number(raw));
                  const cellKey = `${s.strikePrice}_${col.key}`;
                  const isIncreasing = increasingCells.has(cellKey);
                  
                  return (
                    <td
                      key={col.key}
                      style={{ textAlign: col.align }}
                      className={`
                        ${col.key === 'strikePrice' ? 'cell-strike' :
                          col.key === 'formulaA' ? 'cell-formula-a' :
                            col.key === 'formulaB' ? 'cell-formula-b' :
                              col.key === 'difference' ? 'cell-diff' :
                                col.key === 'average' ? 'cell-avg' : ''}
                        ${isIncreasing ? 'cell-value-increase' : ''}
                      `.trim()}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * components/OptionChainTable.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * NIFTY Option Chain table.
 *
 * Column order:
 *   Strike | CE Low | CE High | PE Low | PE High
 *   | PE-S (Formula A) | CE-S (Formula B) | Difference | Average
 *
 * Derived formulas (computed client-side from raw high/low):
 *   PE-S  (Formula A) = (CE High + PE Low)  / 2
 *   CE-S  (Formula B) = (CE Low  + PE High) / 2
 *   Difference        = Formula A − Formula B
 *   Average           = (Formula A + Formula B) / 2
 */

'use client';

import { useState, useMemo, useId } from 'react';
import { Loader } from '@/components/Loader';
import type { OptionRow, SortDirection } from '@/types/option';

// ── Enriched row (adds derived formula fields) ────────────────────────────────

interface EnrichedRow extends OptionRow {
  formulaA: number | null; // PE-S  = (ceHigh + peLow)  / 2
  formulaB: number | null; // CE-S  = (ceLow  + peHigh) / 2
  difference: number | null; // formulaA − formulaB
  average: number | null; // (formulaA + formulaB) / 2
}

function enrich(row: OptionRow): EnrichedRow {
  const fA =
    row.ceHigh !== null && row.peLow !== null
      ? (row.ceHigh + row.peLow) / 2
      : null;

  const fB =
    row.ceLow !== null && row.peHigh !== null
      ? (row.ceLow + row.peHigh) / 2
      : null;

  const diff = fA !== null && fB !== null ? fA - fB : null;
  const avg = fA !== null && fB !== null ? (fA + fB) / 2 : null;

  return { ...row, formulaA: fA, formulaB: fB, difference: diff, average: avg };
}

// ── Types ────────────────────────────────────────────────────────────────────

type SortKey = keyof EnrichedRow;

interface OptionChainTableProps {
  data: OptionRow[];
  loading: boolean;
  timestamp?: string;
  atmStrike?: number | null;
}

// ── Column definitions ────────────────────────────────────────────────────────

const COLUMNS: {
  key: SortKey;
  label: string;
  sublabel?: string;
  colorClass: string;
  align: 'left' | 'right';
  divider?: boolean; // draw a left border separator
}[] = [
    { key: 'strike', label: 'Strike', colorClass: 'cell-strike', align: 'left' },
    { key: 'ceLow', label: 'CE Low', colorClass: 'cell-ce-low', align: 'right' },
    { key: 'ceHigh', label: 'CE High', colorClass: 'cell-ce-high', align: 'right', divider: true },
    { key: 'peLow', label: 'PE Low', colorClass: 'cell-pe-low', align: 'right' },
    { key: 'peHigh', label: 'PE High', colorClass: 'cell-pe-high', align: 'right' },
    { key: 'formulaB', label: 'CE-S', sublabel: '', colorClass: 'cell-formula-b', align: 'right', divider: true },
    { key: 'formulaA', label: 'PE-S', sublabel: '', colorClass: 'cell-formula-a', align: 'right' },
    { key: 'ceLTP', label: 'LTP - CE', sublabel: '', colorClass: 'cell-ce-ltp', align: 'right', divider: true },
    { key: 'peLTP', label: 'LTP - PE', sublabel: '', colorClass: 'cell-pe-ltp', align: 'right' },
    { key: 'difference', label: 'Difference', sublabel: '', colorClass: 'cell-diff', align: 'right', divider: true },
    { key: 'average', label: 'Average', sublabel: '', colorClass: 'cell-avg', align: 'right' },
  ];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a nullable number to 2 decimal places, or "—". */
function fmt(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Comparator — nulls always go to the bottom. */
function compareRows(
  a: EnrichedRow,
  b: EnrichedRow,
  key: SortKey,
  dir: SortDirection,
): number {
  const aVal = a[key];
  const bVal = b[key];
  if (aVal === null && bVal === null) return 0;
  if (aVal === null) return 1;
  if (bVal === null) return -1;
  const diff = (aVal as number) - (bVal as number);
  return dir === 'asc' ? diff : -diff;
}

// ── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <span className={`sort-icon ${active ? 'sort-icon--active' : ''}`} aria-hidden="true">
      {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function OptionChainTable({ data, loading, timestamp, atmStrike }: OptionChainTableProps) {
  const searchId = useId();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('strike');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  // ── Enrich + filter + sort ─────────────────────────────────────────────
  const enriched = useMemo(() => data.map(enrich), [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return enriched;
    return enriched.filter((r) => String(r.strike).includes(search.trim()));
  }, [enriched, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [filtered, sortKey, sortDir],
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <section className="table-container" aria-label="NIFTY option chain table">

      {/* Toolbar */}
      <div className="table-toolbar">
        <div className="table-toolbar__left">
          <h2 className="table-title">
            Option Chain
            <span className="symbol-badge" aria-label="Symbol: NIFTY">NIFTY</span>
          </h2>
          {timestamp && (
            <p className="table-meta">
              {sorted.length} of {data.length} strikes ·{' '}
              {new Date(timestamp).toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour12: false,
              })}{' '}
              IST
            </p>
          )}
        </div>


        {/* Strike search */}
        <div className="search-group">
          <label htmlFor={searchId} className="sr-only">Search by strike price</label>
          <div className="search-input-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id={searchId}
              type="search"
              placeholder="Filter by strike…"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter rows by strike price"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <Loader rows={21} />
      ) : (
        <div className="table-scroll" role="region" aria-label="Scrollable option chain table">
          <table className="option-table" aria-label="NIFTY option chain data">
            <thead className="option-table__head">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={[
                      'option-th',
                      `option-th--${col.align}`,
                      col.divider ? 'option-th--divider' : '',
                    ].join(' ')}
                    aria-sort={
                      sortKey === col.key
                        ? sortDir === 'asc' ? 'ascending' : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="th-sort-btn"
                      onClick={() => handleSort(col.key)}
                      aria-label={`Sort by ${col.label}`}
                    >
                      <span className="th-label-wrap">
                        <span className="th-main-label">{col.label}</span>
                        {col.sublabel && (
                          <span className="th-sub-label">{col.sublabel}</span>
                        )}
                      </span>
                      <SortIcon active={sortKey === col.key} direction={sortDir} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="empty-state">
                    {search ? `No strikes matching "${search}"` : 'No data available.'}
                  </td>
                </tr>
              ) : (
                sorted.map((row) => (
                  <tr
                    key={row.strike}
                    className={`option-row${atmStrike === row.strike ? ' option-row--atm' : ''}`}
                  >
                    <td className="option-td option-td--left  cell-strike">
                      {row.strike.toLocaleString('en-IN')}
                    </td>
                    <td className="option-td option-td--right cell-ce-low">
                      {fmt(row.ceLow)}
                    </td>
                    <td className="option-td option-td--right cell-ce-high">
                      {fmt(row.ceHigh)}
                    </td>
                    <td className="option-td option-td--right cell-pe-low">
                      {fmt(row.peLow)}
                    </td>
                    <td className="option-td option-td--right cell-pe-high">
                      {fmt(row.peHigh)}
                    </td>
                    {/* ── Derived columns ──────────────────────── */}
                    <td className="option-td option-td--right cell-formula-b option-td--divider">
                      {fmt(row.formulaB)}
                    </td>
                    <td className="option-td option-td--right cell-formula-a">
                      {fmt(row.formulaA)}
                    </td>
                    <td className="option-td option-td--right cell-ce-ltp option-td--divider">
                      {fmt(row.ceLTP ?? null)}
                    </td>
                    <td className="option-td option-td--right cell-pe-ltp">
                      {fmt(row.peLTP ?? null)}
                    </td>
                    <td className="option-td option-td--right cell-diff option-td--divider">
                      {fmt(row.difference)}
                    </td>
                    <td className="option-td option-td--right cell-avg">
                      {fmt(row.average)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

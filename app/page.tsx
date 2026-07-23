'use client';

/**
 * app/page.tsx — NIFTY Option Chain Dashboard
 * ──────────────────────────────────────────────────────────────────────────
 * Client-side shell:
 *  1. Fetches /api/option-chain?expiry=...&range=... on mount + every 5 s.
 *  2. Supports ATM ± 5 / ± 10 / ± 15 range selector.
 *  3. Shows live NIFTY spot price in the stat card.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '@/components/Header';
import { OptionChainTable } from '@/components/OptionChainTable';
import { isMarketOpenIST } from '@/lib/market-hours';
import type { OptionChainApiResponse, OptionRow, StrikeRange } from '@/types/option';
import type { LTPRow } from '@/types/ltp';

const REFRESH_INTERVAL_S = 5;
const RANGE_OPTIONS: { value: StrikeRange; label: string }[] = [
  { value: 5, label: 'ATM ± 5' },
  { value: 10, label: 'ATM ± 10' },
  { value: 15, label: 'ATM ± 15' },
];

// ── Icons ────────────────────────────────────────────────────────────────────

function IconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function IconTrend() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconRefreshSmall() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}
function IconAlertTriangle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accentColor?: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, sub, accentColor = '#38BDF8', icon }: StatCardProps) {
  return (
    <div className="stat-card" style={{ '--accent': accentColor } as React.CSSProperties}>
      <div className="stat-card__icon-wrap" style={{ color: accentColor }}>
        {icon}
      </div>
      <div className="stat-card__body">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
        {sub && <p className="stat-card__sub">{sub}</p>}
      </div>
    </div>
  );
}

// ── Range Selector ────────────────────────────────────────────────────────────

interface RangeSelectorProps {
  value: StrikeRange;
  onChange: (r: StrikeRange) => void;
  disabled?: boolean;
}

function RangeSelector({ value, onChange, disabled }: RangeSelectorProps) {
  return (
    <div className="range-selector" role="group" aria-label="Strike range">
      <span className="range-selector__label">Strikes</span>
      <div className="segmented-control">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            id={`range-btn-${opt.value}`}
            className={`segmented-btn${value === opt.value ? ' segmented-btn--active' : ''}`}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            aria-pressed={value === opt.value}
            aria-label={opt.label}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [expiry, setExpiry] = useState('');
  const [range, setRange] = useState<StrikeRange>(5);
  const [data, setData] = useState<OptionRow[]>([]);
  // Merged display data: base data + LTP patch from /api/ltp
  const [mergedData, setMergedData] = useState<OptionRow[]>([]);
  const [ltpRows, setLtpRows] = useState<LTPRow[]>([]);
  const [apiMeta, setApiMeta] = useState<Omit<OptionChainApiResponse, 'data'> | null>(null);
  const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_S);
  const [marketOpen, setMarketOpen] = useState(true); // Default true until mounted

  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch Expiries on Mount ────────────────────────────────────────────
  // ── Fetch Expiries on Mount & Auto-Select First Expiry ──────────────────
  useEffect(() => {
    setMarketOpen(isMarketOpenIST());

    fetch('/api/expiries')
      .then(res => res.json())
      .then(json => {
        if (json.expiries && Array.isArray(json.expiries) && json.expiries.length > 0) {
          setAvailableExpiries(json.expiries);
          setExpiry((prev) => (prev ? prev : json.expiries[0]));
        }
      })
      .catch(err => console.warn('[page] Failed to fetch expiries:', err));
  }, []);

  // ── Core fetch ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async (
    selectedExpiry: string,
    selectedRange: StrikeRange,
    showLoader = false,
  ) => {
    // Prevent fetching if expiry is empty string
    if (!selectedExpiry) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (showLoader) setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/option-chain?expiry=${encodeURIComponent(selectedExpiry)}&range=${selectedRange}`,
        { signal: ctrl.signal, cache: 'no-store' },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const json: OptionChainApiResponse = await res.json();
      setData(json.data);
      setApiMeta({
        timestamp: json.timestamp,
        lastUpdated: json.lastUpdated,
        expiry: json.expiry,
        total: json.total,
        successful: json.successful,
        underlyingValue: json.underlyingValue,
        atmStrike: json.atmStrike,
        range: json.range,
        source: json.source,
        dataAge: json.dataAge,
        isStale: json.isStale,
        diagnostics: json.diagnostics,
      });

      if (json.diagnostics?.expiryCount && Array.isArray((json as any).availableExpiries)) {
        setAvailableExpiries((json as any).availableExpiries);
      }

      // If the API defaulted to a different expiry, sync state
      if (json.expiry && json.expiry !== selectedExpiry) {
        setExpiry(json.expiry);
      }
      setLastUpdated(json.timestamp ? new Date(json.timestamp) : new Date());
      setError(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load option chain.');
    } finally {
      if (abortRef.current === ctrl) {
        if (showLoader) setLoading(false);
      }
    }
  }, []);

  // ── Live LTP fetch (option-chain-v3, 1 request) ────────────────────────
  const fetchLTP = useCallback(async (selectedExpiry: string, selectedRange: StrikeRange) => {
    if (!selectedExpiry) return;
    try {
      const res = await fetch(
        `/api/ltp?expiry=${encodeURIComponent(selectedExpiry)}&range=${selectedRange}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return; // silent — LTP is best-effort
      const json = await res.json();
      if (Array.isArray(json.rows)) {
        setLtpRows(json.rows);
        setLastUpdated(new Date()); // LTP fetch counts as a refresh
      }
    } catch {
      // silent — table still shows High/Low from option-chain
    }
  }, []);

  // ── Merge base data + LTP patch ─────────────────────────────────────────
  // Whenever base data or LTP rows change, rebuild the merged display data.
  useEffect(() => {
    if (data.length === 0) { setMergedData([]); return; }
    if (ltpRows.length === 0) { setMergedData(data); return; }

    const ltpByStrike = new Map(ltpRows.map((r) => [r.strike, r]));
    setMergedData(
      data.map((row) => {
        const ltp = ltpByStrike.get(row.strike);
        if (!ltp) return row;
        return {
          ...row,
          ceLTP: ltp.ceLTP ?? row.ceLTP,
          peLTP: ltp.peLTP ?? row.peLTP,
        };
      }),
    );
  }, [data, ltpRows]);

  // ── Initial load & re-fetch on expiry / range change ──────────────────
  useEffect(() => {
    if (!expiry) return; // Wait until valid expiry is loaded

    setData([]);
    setLtpRows([]);
    setLoading(true);
    setError(null);
    setCountdown(REFRESH_INTERVAL_S);

    // Fire both in parallel — LTP is best-effort and won't block the loader
    fetchData(expiry, range, true).then(() => setLoading(false));
    fetchLTP(expiry, range);

    return () => { abortRef.current?.abort(); };
  }, [expiry, range, fetchData, fetchLTP]);


  // ── Auto-refresh every 5 s ─────────────────────────────────────────────
  useEffect(() => {
    if (!expiry) return;

    setCountdown(REFRESH_INTERVAL_S);

    const countdownId = setInterval(() => {
      const open = isMarketOpenIST();
      setMarketOpen(open);
      if (open) {
        setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL_S : c - 1));
      }
    }, 1000);

    const refreshId = setInterval(() => {
      if (isMarketOpenIST()) {
        // Fetch option-chain (High/Low) and LTP (V3) in parallel
        fetchData(expiry, range, false);
        fetchLTP(expiry, range);
      }
    }, REFRESH_INTERVAL_S * 1000);

    return () => { clearInterval(countdownId); clearInterval(refreshId); };
  }, [expiry, range, fetchData, fetchLTP]);

  // ── Manual refresh ─────────────────────────────────────────────────────
  const handleManualRefresh = useCallback(() => {
    if (!expiry) return;
    setCountdown(REFRESH_INTERVAL_S);
    fetchData(expiry, range, false);
    fetchLTP(expiry, range);
  }, [expiry, range, fetchData, fetchLTP]);

  // ── Derived display values ─────────────────────────────────────────────
  const spotDisplay = apiMeta?.underlyingValue != null
    ? apiMeta.underlyingValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : loading ? '…' : '—';

  const atmDisplay = apiMeta?.atmStrike != null
    ? apiMeta.atmStrike.toLocaleString('en-IN')
    : loading ? '…' : '—';

  const getSourceBadge = () => {
    if (!apiMeta) return loading ? 'Fetching…' : 'Live underlying value';
    const source = apiMeta.source;
    const ageMin = apiMeta.diagnostics?.dataAgeMinutes ?? 0;
    const ageStr = ageMin === 0 ? 'Just now' : `${ageMin}m ago`;

    if (source === 'live') {
      return `🟢 Live · ${ageStr}`;
    } else if (source === 'recent_backup') {
      return `🟡 Recent Backup · ${ageStr}`;
    } else if (source === 'stale' || apiMeta.isStale) {
      return `🔴 Stale · ${ageStr}`;
    } else if (source === 'cache') {
      return `⚪ Cache · ${ageStr}`;
    }
    return `🟡 Backup · ${ageStr}`;
  };

  return (
    <div className="app-shell">
      <div className="app-content">

        {/* Header */}
        <Header
          expiry={expiry}
          availableExpiries={availableExpiries}
          onExpiryChange={setExpiry}
          lastUpdated={lastUpdated}
          refreshCountdown={countdown}
          isLoading={loading}
          onManualRefresh={handleManualRefresh}
          range={range}
        />

        {/* Error Banner */}
        {error && (
          <div className="error-banner" role="alert" aria-live="assertive">
            <div className="error-banner__icon" aria-hidden="true">
              <IconAlertTriangle />
            </div>
            <div className="error-banner__body">
              <p className="error-banner__title">Failed to load data</p>
              <p className="error-banner__msg">{error}</p>
              <p className="error-banner__hint">
                NSE may be applying bot-detection. The next auto-refresh will retry automatically.
              </p>
            </div>
            <button
              type="button"
              className="error-banner__retry"
              onClick={handleManualRefresh}
              disabled={loading}
              aria-label="Retry fetching option chain data"
            >
              Retry
            </button>
          </div>
        )}

        {/* Range Selector */}
        <div className="range-bar">
          <RangeSelector value={range} onChange={setRange} disabled={loading} />
          <p className="range-bar__hint">
            Showing <strong>{data.length}</strong> strikes around ATM <strong>{atmDisplay}</strong>
          </p>
        </div>

        {/* Stat Cards */}
        <div className="stats-grid" aria-label="Summary statistics">
          <StatCard
            label="NIFTY Spot"
            value={spotDisplay}
            sub={getSourceBadge()}
            icon={<IconTrend />}
            accentColor="#38BDF8"
          />
          <StatCard
            label="ATM Strike"
            value={atmDisplay}
            sub="Nearest strike to spot"
            icon={<IconTarget />}
            accentColor="#4ADE80"
          />
          <StatCard
            label="Strike Range"
            value={apiMeta ? `ATM ± ${apiMeta.range}` : loading ? '…' : '—'}
            sub={`${data.length} strikes displayed`}
            icon={<IconLayers />}
            accentColor="#818CF8"
          />
          <StatCard
            label="Auto Refresh"
            value={marketOpen ? `${REFRESH_INTERVAL_S}s` : 'Paused'}
            sub={marketOpen
              ? (lastUpdated ? `Last: ${lastUpdated.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}` : 'Waiting…')
              : 'Market Closed'}
            icon={<IconRefreshSmall />}
            accentColor={marketOpen ? "#FBBF24" : "#9CA3AF"}
          />
        </div>

        {/* Option Chain Table — uses mergedData so LTP-CE/PE come from V3 */}
        <OptionChainTable
          data={mergedData}
          loading={loading}
          timestamp={apiMeta?.timestamp}
          atmStrike={apiMeta?.atmStrike ?? null}
        />

        {/* Footer */}
        <footer className="app-footer" role="contentinfo">
          <p>
            NIFTY Option Chain Dashboard &mdash; Data sourced from{' '}
            <a href="https://www.nseindia.com" target="_blank" rel="noopener noreferrer">
              NSE India
            </a>
            . For informational purposes only. Not financial advice.
          </p>
          <p>  Made by <a href="https://itspk.qzz.io" target="_blank" rel="noopener noreferrer">Pranav Vinayak</a>
            <br></br>
            Powerd by Code29 🖥️ </p>
        </footer>
      </div>
    </div>
  );
}

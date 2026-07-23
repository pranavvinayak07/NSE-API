/**
 * components/Header.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Dashboard header with title, live IST clock, expiry calendar picker,
 * auto-refresh countdown, and last-updated timestamp.
 */

'use client';

import { useEffect, useState } from 'react';

interface HeaderProps {
  expiry: string;
  availableExpiries?: string[];
  onExpiryChange: (expiry: string) => void;
  lastUpdated: Date | null;
  refreshCountdown: number;
  isLoading: boolean;
  onManualRefresh: () => void;
  range: number;
}

// ── Format helpers ────────────────────────────────────────────────────────────

/** Formats a Date as "HH:MM:SS IST". */
function toIST(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Human-readable label for the selected expiry, e.g. "09 Jun 2026". */
function formatExpiryLabel(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('-');
  if (parts.length !== 3) return ddmmyyyy;

  // Handle both DD-MM-YYYY and DD-MMM-YYYY formats
  let date: Date;
  if (isNaN(Number(parts[1]))) {
    // It's DD-MMM-YYYY
    date = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
  } else {
    // It's DD-MM-YYYY
    date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  }

  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Calendar Icon ─────────────────────────────────────────────────────────────

function IconCalendar() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Header({
  expiry,
  availableExpiries,
  onExpiryChange,
  lastUpdated,
  refreshCountdown,
  isLoading,
  onManualRefresh,
  range,
}: HeaderProps) {
  const [clock, setClock] = useState('');

  // Live IST clock
  useEffect(() => {
    const tick = () => setClock(toIST(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="dashboard-header">
      {/* ── Brand ───────────────────────────────────────────────────── */}
      <div className="header-brand">
        <div className="header-logo" aria-hidden="true">
          <img src="/favicon.png" alt="Logo" width={44} height={44} />
        </div>
        <div>
          <h1 className="header-title">NIFTY Calculator</h1>
          <p className="header-subtitle">
            Live derivative data · Auto-refreshes every 5 s
          </p>
        </div>
      </div>

      {/* ── Right controls ───────────────────────────────────────────── */}
      <div className="header-controls">

        {/* ── Expiry Select Dropdown ─────────────────────────────────── */}
        <div className="expiry-group">
          <span className="expiry-label">Expiry</span>
          <div className="expiry-calendar-btn" style={{ position: 'relative', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', pointerEvents: 'none' }}>
              <IconCalendar />
              <span className="expiry-calendar-btn__date">
                {formatExpiryLabel(expiry)}
              </span>
              <span className="expiry-calendar-btn__chevron" aria-hidden="true">▾</span>
            </div>
            <select
              value={expiry}
              onChange={(e) => onExpiryChange(e.target.value)}
              disabled={isLoading || !availableExpiries?.length}
              aria-label="Select expiry date"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {availableExpiries?.length ? (
                availableExpiries.map((exp) => (
                  <option key={exp} value={exp}>
                    {formatExpiryLabel(exp)}
                  </option>
                ))
              ) : (
                <option value={expiry}>{formatExpiryLabel(expiry)}</option>
              )}
            </select>
          </div>
        </div>

        {/* ── Countdown + manual refresh ────────────────────────────── */}
        <div className="refresh-group">
          <div
            className="refresh-countdown"
            aria-label={`Next refresh in ${refreshCountdown} seconds`}
          >
            <span className="refresh-dot" aria-hidden="true" />
            <span className="refresh-text">
              {isLoading ? 'Refreshing…' : `Refresh in ${refreshCountdown}s`}
            </span>
          </div>
          <button
            id="manual-refresh-btn"
            type="button"
            className="refresh-btn"
            onClick={onManualRefresh}
            disabled={isLoading}
            aria-label="Manually refresh option chain data"
            title="Refresh now"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={isLoading ? 'spin-icon' : ''} aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <a
            href={`/api/download?expiry=${encodeURIComponent(expiry)}&range=${range}`}
            target="_blank"
            className="export-btn"
            title="Export to Excel"
            aria-label="Export to Excel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Excel
          </a>
          <a
            href="/chart"
            className="export-btn"
            title="View Historical Chart"
            aria-label="View Historical Chart"
            style={{ backgroundColor: '#4F46E5', borderColor: '#4F46E5', color: 'white' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            Chart
          </a>
          <a
            href="/compare"
            className="export-btn"
            title="Compare Metrics"
            aria-label="Compare Metrics"
            style={{ backgroundColor: '#E91E63', borderColor: '#E91E63', color: 'white' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
            Compare
          </a>
        </div>

        {/* ── Clock + last updated ──────────────────────────────────── */}
        <div className="clock-group">
          <div className="clock-display" aria-label="Current IST time">
            {clock} IST
          </div>
          {lastUpdated && (
            <div className="last-updated">Updated {toIST(lastUpdated)}</div>
          )}
        </div>
      </div>
    </header>
  );
}

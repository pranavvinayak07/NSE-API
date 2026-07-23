/**
 * components/Loader.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Skeleton loader rows that match the option-chain table column layout.
 * Shows animated shimmer placeholders while data is being fetched.
 */

'use client';

interface LoaderProps {
  /** Number of skeleton rows to render. Defaults to 17 (= STRIKES.length). */
  rows?: number;
}

export function Loader({ rows = 17 }: LoaderProps) {
  return (
    <div
      className="skeleton-table"
      role="status"
      aria-label="Loading option chain data"
      aria-busy="true"
    >
      {/* Header skeleton */}
      <div className="skeleton-header-row">
        {['Strike', 'CE High', 'CE Low', 'PE High', 'PE Low'].map((col) => (
          <div key={col} className="skeleton-header-cell">
            <span className="skeleton-line skeleton-header-text" />
          </div>
        ))}
      </div>

      {/* Body skeleton rows */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          {/* Strike — slightly wider */}
          <div className="skeleton-cell skeleton-cell--strike">
            <span className="skeleton-line" style={{ width: '70%' }} />
          </div>
          {/* CE High */}
          <div className="skeleton-cell">
            <span className="skeleton-line" style={{ width: '60%' }} />
          </div>
          {/* CE Low */}
          <div className="skeleton-cell">
            <span className="skeleton-line" style={{ width: '55%' }} />
          </div>
          {/* PE High */}
          <div className="skeleton-cell">
            <span className="skeleton-line" style={{ width: '60%' }} />
          </div>
          {/* PE Low */}
          <div className="skeleton-cell">
            <span className="skeleton-line" style={{ width: '55%' }} />
          </div>
        </div>
      ))}

      <p className="sr-only">Loading NIFTY option chain data, please wait…</p>
    </div>
  );
}

/** Inline spinner for buttons / small contexts. */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="spinner-svg"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="60"
        strokeDashoffset="20"
        strokeLinecap="round"
      />
    </svg>
  );
}

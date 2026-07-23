'use client';

import { useState, useEffect } from 'react';

interface DownloadButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}

const LOADING_MESSAGES = [
  'Warming up NSE session…',
  'Establishing secure connection…',
  'Fetching live option chain…',
  'Calculating strikes…',
  'Generating Excel report…',
];

export function DownloadButton({ onClick, loading, disabled }: DownloadButtonProps) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!loading) {
      setMsgIndex(0);
      return;
    }
    const intervals = [0, 4000, 9000, 18000, 24000];
    const timers = intervals.map((delay, i) =>
      setTimeout(() => setMsgIndex(i), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  return (
    <button
      id="download-btn"
      type="button"
      className={`download-btn${loading ? ' download-btn--loading' : ''}`}
      onClick={onClick}
      disabled={loading || disabled}
      aria-label="Download Excel report"
      aria-busy={loading}
    >
      {loading ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {LOADING_MESSAGES[msgIndex]}
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download Excel
        </>
      )}
    </button>
  );
}

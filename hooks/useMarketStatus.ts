'use client';

import { useState, useEffect } from 'react';

interface MarketStatus {
  isOpen: boolean;
  reason: string;
  nextOpenIST: string | null;
  timeIST: string;
}

function computeMarketStatus(): MarketStatus {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);

  const day = ist.getUTCDay();
  const hh  = ist.getUTCHours();
  const mm  = ist.getUTCMinutes();
  const ss  = ist.getUTCSeconds();
  const timeInMinutes = hh * 60 + mm;

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeIST = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;

  const OPEN_MIN  = 9  * 60 + 15;  // 9:15 AM
  const CLOSE_MIN = 15 * 60 + 30;  // 3:30 PM

  if (day === 0 || day === 6) {
    return {
      isOpen: false,
      reason: `Closed — ${day === 6 ? 'Saturday' : 'Sunday'}`,
      nextOpenIST: 'Monday 9:15 AM IST',
      timeIST,
    };
  }
  if (timeInMinutes < OPEN_MIN) {
    const minsLeft = OPEN_MIN - timeInMinutes;
    const h = Math.floor(minsLeft / 60);
    const m = minsLeft % 60;
    return {
      isOpen: false,
      reason: `Pre-Market — opens in ${h > 0 ? `${h}h ` : ''}${m}m`,
      nextOpenIST: 'Today 9:15 AM IST',
      timeIST,
    };
  }
  if (timeInMinutes >= CLOSE_MIN) {
    return {
      isOpen: false,
      reason: 'Closed — After-Hours',
      nextOpenIST: 'Tomorrow 9:15 AM IST',
      timeIST,
    };
  }

  const minsLeft = CLOSE_MIN - timeInMinutes;
  const h = Math.floor(minsLeft / 60);
  const m = minsLeft % 60;
  return {
    isOpen: true,
    reason: `Open — closes in ${h > 0 ? `${h}h ` : ''}${m}m`,
    nextOpenIST: null,
    timeIST,
  };
}

export function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(computeMarketStatus);

  useEffect(() => {
    // Update every 30 seconds (status changes are not second-precise)
    const timer = setInterval(() => setStatus(computeMarketStatus()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return status;
}

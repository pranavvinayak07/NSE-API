'use client';

import { useState, useEffect } from 'react';

export function useLiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dd = pad(now.getDate());
      const mo = pad(now.getMonth() + 1);
      const yy = now.getFullYear();
      const hh = pad(now.getHours());
      const mm = pad(now.getMinutes());
      const ss = pad(now.getSeconds());
      setTime(`${dd}/${mo}/${yy}  ${hh}:${mm}:${ss}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

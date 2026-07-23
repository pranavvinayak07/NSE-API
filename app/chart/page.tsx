'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { HistoricalChart } from '@/components/HistoricalChart';
import Link from 'next/link';

type ChartType = 'ceLow' | 'ceHigh' | 'peLow' | 'peHigh' | 'ceLTP' | 'peLTP' | 'spot' | 'ceS' | 'peS' | 'difference' | 'average';
type Timeframe = '1D' | '2D' | '3D' | '4D' | '5D' | '6D' | '7D' | 'ALL';
type IntervalMin = 1 | 2 | 3 | 4 | 5 | 10 | 30 | 60;

const INTERVAL_OPTIONS: { value: IntervalMin; label: string }[] = [
  { value: 1,  label: '1 min' },
  { value: 2,  label: '2 min' },
  { value: 3,  label: '3 min' },
  { value: 4,  label: '4 min' },
  { value: 5,  label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hr' },
];

interface ChartData {
  time: number;
  value: number;
}

interface ApiResponse {
  series: {
    ceLow: ChartData[];
    ceHigh: ChartData[];
    peLow: ChartData[];
    peHigh: ChartData[];
    ceLTP: ChartData[];
    peLTP: ChartData[];
    spot: ChartData[];
    ceS: ChartData[];
    peS: ChartData[];
    difference: ChartData[];
    average: ChartData[];
  };
  availableStrikes: number[];
  dbExpiries: string[];
  currentExpiry: string | null;
  error?: string;
}

interface OptionChainMeta {
  atmStrike: number | null;
  underlyingValue: number | null;
}

export default function ChartPage() {
  const [chartType, setChartType] = useState<ChartType>('ceHigh');
  const [strike, setStrike] = useState<number | ''>('');
  const [expiry, setExpiry] = useState<string>('');
  const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [interval, setInterval] = useState<IntervalMin>(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atmStrike, setAtmStrike] = useState<number | null>(null);

  // Fetch ATM + available expiries (live NSE, current + future) on mount
  useEffect(() => {
    fetch(`/api/expiries`)
      .then(res => res.json())
      .then((json: { atmStrike: number | null; expiries?: string[] }) => {
        if (json.atmStrike) setAtmStrike(json.atmStrike);
        if (Array.isArray(json.expiries) && json.expiries.length > 0) {
          setAvailableExpiries(json.expiries);
          setExpiry(json.expiries[0]); // default nearest expiry
        }
      })
      .catch(err => console.warn('[chart] Failed to fetch expiries:', err));
  }, []);

  const fetchData = useCallback(async (selectedStrike: number | '', selectedTimeframe: Timeframe, selectedInterval: IntervalMin, selectedExpiry: string) => {
    setLoading(true);
    setError(null);
    try {
      const expiryQ = selectedExpiry ? `&expiry=${encodeURIComponent(selectedExpiry)}` : '';
      const res = await fetch(`/api/chart-option-chain?strike=${selectedStrike || 0}&timeframe=${selectedTimeframe}&interval=${selectedInterval}${expiryQ}`);
      if (!res.ok) {
        throw new Error('Failed to fetch data');
      }
      const json: ApiResponse = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json);

      // Sync expiry selector if API auto-corrected to nearest DB expiry
      if (json.currentExpiry && json.currentExpiry !== selectedExpiry) {
        setExpiry(json.currentExpiry);
      }

      // Auto-select ATM or middle strike
      if (selectedStrike === '') {
        if (json.availableStrikes && json.availableStrikes.length > 0) {
          if (atmStrike && json.availableStrikes.includes(atmStrike)) {
            setStrike(atmStrike);
          } else {
            const middleIndex = Math.floor(json.availableStrikes.length / 2);
            setStrike(json.availableStrikes[middleIndex]);
          }
        } else if (atmStrike) {
          setStrike(atmStrike); // Fallback to current ATM if no data
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [atmStrike]);

  // Initial load + re-fetch when expiry/timeframe/interval/strike changes
  useEffect(() => {
    if (!expiry) return;
    fetchData(strike, timeframe, interval, expiry);
  }, [strike, timeframe, interval, expiry, fetchData]);


  // Reset strike when expiry changes (different expiry = different available strikes)
  const handleExpiryChange = (val: string) => {
    setStrike('');
    setExpiry(val);
  };

  const handleIntervalChange = (val: IntervalMin) => {
    setInterval(val);
  };

  // Derived active series
  const activeSeries = data?.series?.[chartType] || [];

  // Find if current strike is ATM for display
  const isAtmSelected = strike !== '' && strike === atmStrike;

  return (
    <div className="app-shell" style={{ minHeight: '100vh', padding: '2rem' }}>
      <div className="app-content" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 className="header-title" style={{ fontSize: '1.5rem' }}>Historical Option Charts</h1>
          <Link href="/" className="export-btn" style={{ textDecoration: 'none' }}>
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="control-panel">

          {/* Expiry Selector */}
          <div className="selector-group" style={{ flex: 1, minWidth: '150px' }}>
            <p className="selector-label" style={{ color: '#F472B6' }}>Expiry</p>
            <div className="select-wrapper" style={{ width: '100%' }}>
              <select
                value={expiry}
                onChange={(e) => handleExpiryChange(e.target.value)}
                className="custom-select"
                style={{ width: '100%' }}
                disabled={availableExpiries.length === 0}
              >
                {availableExpiries.length === 0 && (
                  <option value="">Loading...</option>
                )}
                {availableExpiries.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <div className="select-arrow">▼</div>
            </div>
          </div>

          {/* Chart Type Selector */}
          <div className="selector-group" style={{ flex: 1, minWidth: '150px' }}>
            <p className="selector-label" style={{ color: '#38BDF8' }}>Metric</p>
            <div className="select-wrapper" style={{ width: '100%' }}>
              <select 
                value={chartType} 
                onChange={(e) => setChartType(e.target.value as ChartType)}
                className="custom-select"
                style={{ width: '100%' }}
              >
                <option value="ceHigh">Call (CE) High</option>
                <option value="ceLow">Call (CE) Low</option>
                <option value="peHigh">Put (PE) High</option>
                <option value="peLow">Put (PE) Low</option>
                <option value="ceLTP">LTP - CE</option>
                <option value="peLTP">LTP - PE</option>
                <option value="spot">NIFTY Spot Price</option>
                <option value="ceS">CE-S</option>
                <option value="peS">PE-S</option>
                <option value="difference">Difference</option>
                <option value="average">Average</option>
              </select>
              <div className="select-arrow">▼</div>
            </div>
          </div>


          {/* Strike Selector */}
          <div className="selector-group" style={{ flex: 1, minWidth: '150px' }}>
            <p className="selector-label" style={{ color: '#4ADE80' }}>
              Strike Price
              {isAtmSelected && <span style={{ color: '#4ADE80', fontSize: '0.75rem', marginLeft: '0.5rem' }}>● ATM</span>}
            </p>
            <div className="select-wrapper" style={{ width: '100%' }}>
              <select 
                value={strike} 
                onChange={(e) => setStrike(Number(e.target.value))}
                className="custom-select"
                style={{ width: '100%' }}
                disabled={!data?.availableStrikes?.length && strike === ''}
              >
                <option value="" disabled>Select Strike...</option>
                {data?.availableStrikes?.length ? (
                  data.availableStrikes.map(s => (
                    <option key={s} value={s}>
                      {s}{s === atmStrike ? ' (ATM)' : ''}
                    </option>
                  ))
                ) : strike !== '' ? (
                  <option value={strike}>{strike}{strike === atmStrike ? ' (ATM)' : ''}</option>
                ) : null}
              </select>
              <div className="select-arrow">▼</div>
            </div>
          </div>

          {/* Interval Selector */}
          <div className="selector-group" style={{ flex: 1, minWidth: '150px' }}>
            <p className="selector-label" style={{ color: '#FB923C' }}>Candle Interval</p>
            <div className="select-wrapper" style={{ width: '100%' }}>
              <select
                value={interval}
                onChange={(e) => handleIntervalChange(Number(e.target.value) as IntervalMin)}
                className="custom-select"
                style={{ width: '100%' }}
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="select-arrow">▼</div>
            </div>
          </div>

          {/* Timeframe Selector */}
          <div className="selector-group" style={{ flex: 1, minWidth: '150px' }}>
            <p className="selector-label" style={{ color: '#818CF8' }}>Timeframe</p>
            <div className="select-wrapper" style={{ width: '100%' }}>
              <select 
                value={timeframe} 
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                className="custom-select"
                style={{ width: '100%' }}
              >
                <option value="1D">Today (1D)</option>
                <option value="2D">2 Days</option>
                <option value="3D">3 Days</option>
                <option value="4D">4 Days</option>
                <option value="5D">5 Days</option>
                <option value="6D">6 Days</option>
                <option value="7D">Weekly (7D)</option>
                <option value="ALL">Until Expiry (ALL)</option>
              </select>
              <div className="select-arrow">▼</div>
            </div>
          </div>

        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: '2rem' }}>
            <p className="error-banner__title">Error loading data</p>
            <p className="error-banner__msg">{error}</p>
          </div>
        )}

        <div className="control-panel" style={{ marginTop: '2rem' }}>
          <h2 style={{ color: 'white', fontSize: '1.25rem', margin: 0, width: '100%' }}>
            {chartType === 'spot' 
              ? 'NIFTY Spot Price' 
              : `${strike} ${
                  chartType === 'ceHigh' ? 'Call (CE) High' :
                  chartType === 'ceLow' ? 'Call (CE) Low' :
                  chartType === 'peHigh' ? 'Put (PE) High' :
                  chartType === 'peLow' ? 'Put (PE) Low' :
                  chartType === 'ceLTP' ? 'LTP - CE' :
                  chartType === 'peLTP' ? 'LTP - PE' :
                  chartType === 'ceS' ? 'CE-S' :
                  chartType === 'peS' ? 'PE-S' :
                  chartType === 'difference' ? 'Difference' :
                  'Average'
                }`
            }
            <span style={{ fontSize: '0.875rem', color: '#9CA3AF', marginLeft: '0.5rem', fontWeight: 'normal' }}>
              ({timeframe})
            </span>
          </h2>
          
          <div style={{ width: '100%' }}>
          {loading ? (
            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>
              Loading chart data...
            </div>
          ) : activeSeries.length > 0 ? (
            <HistoricalChart data={activeSeries} />
          ) : (
            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>
              No data available for the selected timeframe and strike.
            </div>
          )}
          </div>
        </div>

      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time, LineData } from 'lightweight-charts';

interface ComparisonChartProps {
  data1: { time: number; value: number }[];
  data2: { time: number; value: number }[];
  name1: string;
  name2: string;
  color1?: string;
  color2?: string;
}

export function ComparisonChart({
  data1,
  data2,
  name1,
  name2,
  color1 = '#2962FF', // Blue
  color2 = '#E91E63', // Pink/Red
}: ComparisonChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#D1D5DB', // tailwind gray-300
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Series 1
    const series1 = chart.addSeries(LineSeries, {
      color: color1,
      lineWidth: 2,
      title: name1,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    const formatData = (data: { time: number; value: number }[]) => {
      const formatted = data.map(d => {
        const offset = new Date(d.time * 1000).getTimezoneOffset() * 60;
        return {
          time: (d.time - offset) as Time,
          value: d.value,
        };
      }) as LineData[];
      const unique = Array.from(new Map(formatted.map(item => [item.time, item])).values());
      unique.sort((a, b) => (a.time as number) - (b.time as number));
      return unique;
    };

    if (data1.length > 0) {
      series1.setData(formatData(data1));
    }

    // Series 2
    const series2 = chart.addSeries(LineSeries, {
      color: color2,
      lineWidth: 2,
      title: name2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    if (data2.length > 0) {
      series2.setData(formatData(data2));
    }

    chart.timeScale().fitContent();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data1, data2, color1, color2, name1, name2]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Custom Legend */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: 'rgba(0,0,0,0.5)',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color1 }}></div>
          <span style={{ color: '#fff', fontSize: '0.875rem' }}>{name1}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color2 }}></div>
          <span style={{ color: '#fff', fontSize: '0.875rem' }}>{name2}</span>
        </div>
      </div>

      <div ref={chartContainerRef} style={{ width: '100%', height: '400px' }} />
    </div>
  );
}

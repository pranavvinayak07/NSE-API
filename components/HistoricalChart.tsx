'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, BaselineData, Time, BaselineSeries } from 'lightweight-charts';

interface HistoricalChartProps {
  data: { time: number; value: number }[];
  baseValue?: number;
  lineColor?: string;
  topFillColor1?: string;
  topFillColor2?: string;
  bottomFillColor1?: string;
  bottomFillColor2?: string;
}

export function HistoricalChart({
  data,
  baseValue,
  lineColor = '#2962FF',
  topFillColor1 = 'rgba(38, 166, 154, 0.28)',
  topFillColor2 = 'rgba(38, 166, 154, 0.05)',
  bottomFillColor1 = 'rgba(239, 83, 80, 0.05)',
  bottomFillColor2 = 'rgba(239, 83, 80, 0.28)',
}: HistoricalChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Default baseValue to the first data point if not provided
    const actualBaseValue = baseValue !== undefined 
      ? baseValue 
      : (data.length > 0 ? data[0].value : 0);

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

    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: actualBaseValue },
      topLineColor: 'rgba(38, 166, 154, 1)',
      topFillColor1,
      topFillColor2,
      bottomLineColor: 'rgba(239, 83, 80, 1)',
      bottomFillColor1,
      bottomFillColor2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });
    
    // lightweight-charts displays UTC by default for unix timestamps.
    // We offset the time by the local timezone offset to display local time correctly.
    const formattedData = data.map(d => {
      const offset = new Date(d.time * 1000).getTimezoneOffset() * 60;
      return {
        time: (d.time - offset) as Time,
        value: d.value,
      };
    }) as BaselineData[];

    // Ensure data is sorted and distinct
    const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values());
    uniqueData.sort((a, b) => (a.time as number) - (b.time as number));

    series.setData(uniqueData);
    seriesRef.current = series;

    chart.timeScale().fitContent();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, baseValue, topFillColor1, topFillColor2, bottomFillColor1, bottomFillColor2]);

  return <div ref={chartContainerRef} style={{ width: '100%', height: '400px' }} />;
}

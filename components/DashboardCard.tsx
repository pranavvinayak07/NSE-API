'use client';

import React from 'react';

interface DashboardCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  accentColor?: string;
  loading?: boolean;
}

export function DashboardCard({ label, value, subValue, icon, accentColor = '#38BDF8', loading }: DashboardCardProps) {
  return (
    <div className="dashboard-card" style={{ '--accent': accentColor } as React.CSSProperties}>
      <div className="dashboard-card__icon-wrap">
        {icon}
      </div>
      <div className="dashboard-card__content">
        <p className="dashboard-card__label">{label}</p>
        {loading ? (
          <div className="skeleton-line" style={{ width: '70%', height: '24px', marginTop: '4px' }} />
        ) : (
          <>
            <p className="dashboard-card__value">{value}</p>
            {subValue && <p className="dashboard-card__sub">{subValue}</p>}
          </>
        )}
      </div>
    </div>
  );
}

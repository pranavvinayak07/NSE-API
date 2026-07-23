'use client';

import { STRIKE_RANGES } from '@/lib/constants';
import type { StrikeRange } from '@/types/option-chain';

interface RangeSelectorProps {
  value: StrikeRange;
  onChange: (value: StrikeRange) => void;
  disabled?: boolean;
}

export function RangeSelector({ value, onChange, disabled }: RangeSelectorProps) {
  return (
    <div className="selector-group">
      <label className="selector-label">Strike Range</label>
      <div className="segmented-control" role="group" aria-label="Strike range selector">
        {STRIKE_RANGES.map(r => (
          <button
            key={r.value}
            type="button"
            disabled={disabled}
            className={`segmented-btn${value === r.value ? ' segmented-btn--active' : ''}`}
            onClick={() => onChange(r.value)}
            aria-pressed={value === r.value}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

'use client';

import { SYMBOLS } from '@/lib/constants';
import type { SymbolType } from '@/types/option-chain';

interface SymbolSelectorProps {
  value: SymbolType;
  onChange: (value: SymbolType) => void;
  disabled?: boolean;
}

export function SymbolSelector({ value, onChange, disabled }: SymbolSelectorProps) {
  return (
    <div className="selector-group">
      <label className="selector-label" htmlFor="symbol-select">Index Symbol</label>
      <div className="select-wrapper">
        <select
          id="symbol-select"
          className="custom-select"
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value as SymbolType)}
        >
          {SYMBOLS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <span className="select-arrow">▾</span>
      </div>
    </div>
  );
}

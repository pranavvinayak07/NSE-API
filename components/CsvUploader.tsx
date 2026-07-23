'use client';

import { useRef, useState } from 'react';
import type { SymbolType, StrikeRange, PreviewData } from '@/types/option-chain';

interface CsvUploaderProps {
  symbol: SymbolType;
  range: StrikeRange;
  onSuccess: (data: PreviewData, file: File) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

export function CsvUploader({ symbol, range, onSuccess, onError, disabled }: CsvUploaderProps) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [loading, setLoading]   = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      onError('Please upload a .csv file downloaded from nseindia.com.');
      return;
    }

    setLoading(true);
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append('file',   file);
      form.append('symbol', symbol);
      form.append('range',  String(range));

      const res  = await fetch('/api/upload-csv', { method: 'POST', body: form });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'CSV upload failed.');
      onSuccess(json as PreviewData, file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'CSV upload failed.';
      onError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (files?.[0]) upload(files[0]);
  }

  return (
    <div className="csv-uploader-wrap">
      <p className="csv-uploader__label">
        <span className="csv-uploader__icon" aria-hidden="true">📥</span>
        Or upload NSE Option Chain CSV
        <a
          href="https://www.nseindia.com/option-chain"
          target="_blank"
          rel="noopener noreferrer"
          className="csv-uploader__link"
          title="Download CSV from NSE website"
        >
          (Download from NSE ↗)
        </a>
      </p>

      <div
        className={`csv-drop-zone${dragOver ? ' csv-drop-zone--over' : ''}${loading ? ' csv-drop-zone--loading' : ''}`}
        onDragOver={e  => { e.preventDefault(); setDragOver(true);  }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !loading && !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload NSE option chain CSV file"
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          disabled={loading || disabled}
          onChange={e => handleFiles(e.target.files)}
        />

        {loading ? (
          <>
            <span className="spinner spinner--sm" aria-hidden="true" />
            <span>Processing <strong>{fileName}</strong>…</span>
          </>
        ) : fileName ? (
          <>
            <span className="csv-drop-zone__icon">✅</span>
            <span><strong>{fileName}</strong> loaded — click to replace</span>
          </>
        ) : (
          <>
            <span className="csv-drop-zone__icon" aria-hidden="true">📂</span>
            <span>
              <strong>Drag & drop</strong> or <strong>click to browse</strong>
              <br />
              <small>.csv file from nseindia.com option chain page</small>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

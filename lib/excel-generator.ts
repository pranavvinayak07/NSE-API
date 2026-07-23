import ExcelJS from 'exceljs';
import type { ProcessedStrike } from '@/types/option-chain';
import { format } from './date-utils';

interface ExcelMeta {
  symbol: string;
  underlyingValue: number;
  atmStrike: number;
  timestamp: string;
  range: number;
}

// Color palette
const COLORS = {
  headerBg:     '1E293B', // slate-800
  headerFg:     'F8FAFC', // slate-50
  titleBg:      '0F172A', // slate-900
  titleFg:      '38BDF8', // sky-400
  atmBg:        '14532D', // green-900
  atmFg:        '86EFAC', // green-300
  formulaABg:   '064E3B', // emerald-900 tint (green for PE-S)
  formulaBBg:   '7F1D1D', // red-900 tint (red for CE-S)
  diffBg:       '451A03', // amber-950 tint
  avgBg:        '1C1917', // stone-900 tint
  altRow:       '0F172A', // alternate row
  borderColor:  '334155', // slate-700
  numberColor:  'CBD5E1', // slate-300
  atmHighlight: '166534', // green-800
};

function money(value: number): string {
  return value.toFixed(2);
}

export async function generateOptionChainExcel(
  strikes: ProcessedStrike[],
  meta: ExcelMeta
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'NSE Option Chain Analyzer';
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  const sheet = workbook.addWorksheet('OptionChain', {
    views: [{ state: 'frozen', ySplit: 2 }],
    properties: { tabColor: { argb: 'FF38BDF8' } },
  });

  // ── Column definitions ────────────────────────────────────────────
  sheet.columns = [
    { key: 'strike',     width: 14 },
    { key: 'callLow',    width: 12 },
    { key: 'callHigh',   width: 12 },
    { key: 'putLow',     width: 12 },
    { key: 'putHigh',    width: 12 },
    { key: 'formulaB',   width: 14 },
    { key: 'formulaA',   width: 14 },
    { key: 'difference', width: 14 },
    { key: 'average',    width: 14 },
    { key: 'updated',    width: 22 },
  ];

  // ── Row 1: Title ─────────────────────────────────────────────────
  const titleRow = sheet.addRow([
    `NSE Option Chain Analysis — ${meta.symbol}  |  Underlying: ${meta.underlyingValue.toFixed(2)}  |  ATM: ${meta.atmStrike}  |  ATM ± ${meta.range}`,
  ]);
  sheet.mergeCells('A1:J1');
  titleRow.height = 32;
  const titleCell = titleRow.getCell(1);
  titleCell.font    = { bold: true, size: 13, color: { argb: 'FF' + COLORS.titleFg } };
  titleCell.fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.titleBg } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // ── Row 2: Headers ───────────────────────────────────────────────
  const headers = [
    'Strike Price',
    'CE Low',
    'CE High',
    'PE Low',
    'PE High',
    'CE-S\n(CL+PH)/2',
    'PE-S\n(CH+PL)/2',
    'Difference\n|A−B|',
    'Average\n(A+B)/2',
    'Last Updated',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 40;

  headerRow.eachCell(cell => {
    cell.font      = { bold: true, size: 10, color: { argb: 'FF' + COLORS.headerFg } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF38BDF8' } },
    };
  });

  // Enable autoFilter on row 2
  sheet.autoFilter = { from: 'A2', to: 'J2' };

  // ── Data rows ────────────────────────────────────────────────────
  const formattedTimestamp = format(new Date(meta.timestamp));

  strikes.forEach((s, idx) => {
    const rowData = [
      s.strikePrice,
      money(s.callLow),
      money(s.callHigh),
      money(s.putLow),
      money(s.putHigh),
      money(s.formulaB),
      money(s.formulaA),
      money(s.difference),
      money(s.average),
      formattedTimestamp,
    ];

    const row = sheet.addRow(rowData);
    row.height = 22;

    const isAlt = idx % 2 === 1;
    const baseBg = s.isATM ? COLORS.atmBg : (isAlt ? COLORS.altRow : '111827');

    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.font = {
        size: 10,
        bold: s.isATM,
        color: { argb: s.isATM ? 'FF' + COLORS.atmFg : 'FFE2E8F0' },
      };

      // Column-specific background
      let bg = baseBg;
      if (!s.isATM) {
        if (colNumber === 6) bg = COLORS.formulaBBg;
        if (colNumber === 7) bg = COLORS.formulaABg;
        if (colNumber === 8) bg = COLORS.diffBg;
        if (colNumber === 9) bg = COLORS.avgBg;
      }

      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };

      // Strike price column — bold cyan
      if (colNumber === 1) {
        cell.font = { ...cell.font, bold: true, color: { argb: s.isATM ? 'FF86EFAC' : 'FF38BDF8' } };
      }
    });

    // ATM row border emphasis
    if (s.isATM) {
      row.eachCell(cell => {
        cell.border = {
          top:    { style: 'medium', color: { argb: 'FF4ADE80' } },
          bottom: { style: 'medium', color: { argb: 'FF4ADE80' } },
        };
      });
    }
  });

  // ── Summary footer ───────────────────────────────────────────────
  sheet.addRow([]);
  const footerRow = sheet.addRow([
    `Generated: ${formattedTimestamp}  |  © NSE Option Chain Analyzer`,
  ]);
  sheet.mergeCells(`A${footerRow.number}:J${footerRow.number}`);
  footerRow.getCell(1).font      = { italic: true, size: 9, color: { argb: 'FF64748B' } };
  footerRow.getCell(1).alignment = { horizontal: 'right' };
  footerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

  // ── Convert to Uint8Array for Next.js BodyInit compatibility ────────
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(arrayBuffer as ArrayBuffer);
}

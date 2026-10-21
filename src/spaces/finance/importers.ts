/* Statement import: CSV (auto-detected columns), OFX / QFX, and pasted
   statement text (from a PDF). Pure functions — used by the Import screen and
   the finance_import_transactions agent tool. Writing happens in ops.ts. */
import { pad2, todayISO, addDays } from '@/lib/dates';
import { parseCSV } from '@/lib/csv';
import type { AccountType, CsvMapping, FinanceData, FinRule, FinTransaction } from './types';
import { round2 } from './calc';

/** One transaction read from a statement. */
export interface ParsedRow {
  date: string;
  description: string;
  /** signed: negative = money out */
  amount: number;
  balance?: number;
  /** OFX transaction id */
  fitid?: string;
  /** optional, from agents */
  category?: string;
  merchant?: string;
  notes?: string;
}

/* ---------------------------------------------------------------- amounts & dates */

/** "(1,234.56)", "-$12.30", "12.30-", "45,10 €", "1.234,56", "12.00 CR" → number (null if not an amount). */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  let s = String(raw ?? '').trim();
  if (!s) return null;
  let neg = false;
  s = s.replace(/[−–]/g, '-');
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const suffix = /\s*\b(cr|dr|credit|debit)\.?$/i.exec(s);
  if (suffix) {
    if (/^d/i.test(suffix[1])) neg = !neg;
    s = s.slice(0, suffix.index);
  }
  s = s.trim();
  if (s.endsWith('-')) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/^[^\d\-.,]+/, '').replace(/[^\d.,\-]+$/, '').replace(/\s/g, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  s = s.replace(/^[^\d.,]+/, '');
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // the later separator is the decimal one
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "12,50" decimal comma; "1,234" thousands
    s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return round2(neg ? -n : n);
}

export type DateFormat = 'auto' | 'MDY' | 'DMY' | 'YMD';
export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'auto', label: 'Detect automatically' },
  { value: 'MDY', label: 'Month / day / year (10/31/2026)' },
  { value: 'DMY', label: 'Day / month / year (31/10/2026)' },
  { value: 'YMD', label: 'Year-month-day (2026-10-31)' },
];

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const monthNum = (name: string): number | undefined => MONTHS[name.slice(0, 4).toLowerCase()] ?? MONTHS[name.slice(0, 3).toLowerCase()];

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1970 && y <= 2100)) return null;
  const dt = new Date(y, m - 1, d, 12);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Year for dates printed without one (statements): this year, or last year if that lands in the future. */
function yearFor(m: number, d: number, fallbackYear?: number): number {
  if (fallbackYear) return fallbackYear;
  const today = todayISO();
  const y = Number(today.slice(0, 4));
  const candidate = `${y}-${pad2(m)}-${pad2(d)}`;
  return candidate > addDays(today, 7) ? y - 1 : y;
}

/** Parse a date in many bank formats. `fmt` resolves ambiguous numeric dates (10/03). */
export function parseDate(raw: string, fmt: DateFormat = 'auto', fallbackYear?: number): string | null {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s); // OFX 20261003120000
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})([-/.])(\d{1,2})(?:[-/.](\d{2,4}))?\b/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[3];
    let dmy = fmt === 'DMY';
    // auto: 31/10 is day-first; dotted dates (03.10.2026) are European, day-first
    if (fmt === 'auto' || fmt === 'YMD') dmy = (a > 12 && b <= 12) || (m[2] === '.' && b <= 12);
    const [mo, d] = dmy ? [b, a] : [a, b];
    const y = m[4] ? +m[4] : yearFor(mo, d, fallbackYear);
    return iso(y, mo, d);
  }
  m = /^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?(?:[ -](\d{2,4}))?/.exec(s); // 3 Oct 2026, 03-Oct-26
  if (m) {
    const mo = monthNum(m[2]);
    if (mo) return iso(m[3] ? +m[3] : yearFor(mo, +m[1], fallbackYear), mo, +m[1]);
  }
  m = /^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,?(?: (\d{4}))?/.exec(s); // Oct 3, 2026
  if (m) {
    const mo = monthNum(m[1]);
    if (mo) return iso(m[3] ? +m[3] : yearFor(mo, +m[2], fallbackYear), mo, +m[2]);
  }
  return null;
}

/** Guess the numeric date order from sample values. */
export function detectDateFormat(values: string[]): Exclude<DateFormat, 'auto'> {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const s = v.trim();
    if (/^\d{4}[-/.]/.test(s)) return 'YMD';
    const m = /^(\d{1,2})([-/.])(\d{1,2})/.exec(s);
    if (!m) continue;
    if (m[2] === '.') dmy += 0.5; // 03.10.2026 is European
    if (+m[1] > 12) dmy++;
    if (+m[3] > 12) mdy++;
  }
  return dmy > mdy ? 'DMY' : 'MDY';
}

/* ---------------------------------------------------------------- CSV */

export interface CsvDetection {
  mapping: CsvMapping;
  /** problems that need the user's attention */
  problems: string[];
  rows: string[][];
}

const H = {
  date: /^(transaction |trans\.? |posting |posted |booking |value )?date$|^date|date$|^datum|buchungstag|^fecha|^data$/i,
  dateWeak: /date|posted|time|datum|valuta|fecha/i,
  description: /description|payee|merchant|narrative|details|^name$|transaction$|particulars|reference|beschreibung|verwendungszweck|buchungstext|empf|libell|concepto|descri/i,
  memo: /memo|note|additional|extended/i,
  amount: /^(transaction )?amount|amount$|^value$|^sum$|^amt|betrag|montant|importe|^bedrag/i,
  debit: /debit|withdraw|money out|paid out|^out$|charge|spent|belastung|^soll|ausgang|lastschrift|cargo/i,
  credit: /credit|deposit|money in|paid in|^in$|payment|received|gutschrift|^haben|eingang|abono/i,
  balance: /balance|saldo|kontostand|solde/i,
  category: /category|type/i,
};

/** Detect columns of a bank / card CSV export. */
export function detectCsv(text: string, accountType?: AccountType, remembered?: CsvMapping): CsvDetection {
  const sep = guessSeparator(text);
  const rows = (sep === ',' ? parseCSV(text) : parseDelimited(text, sep)).filter((r) => r.some((c) => c.trim()));
  const problems: string[] = [];
  if (!rows.length) return { rows, problems: ['The file is empty.'], mapping: { date: 0, description: 1, amount: 2, dateFormat: 'auto', invert: false, headerRow: true } };
  // some banks put a few lines of account info above the real header: find the first row that looks like a header
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i].map((c) => c.trim().toLowerCase());
    if (r.some((c) => H.date.test(c) || c === 'date') && r.some((c) => H.amount.test(c) || H.debit.test(c) || H.credit.test(c))) {
      start = i;
      break;
    }
  }
  const body = rows.slice(start);
  const first = body[0].map((c) => c.trim());
  const headerRow = first.filter((c) => c && parseAmount(c) == null && !parseDate(c)).length >= Math.ceil(first.length / 2);
  const headers = headerRow ? first : first.map((_, i) => `Column ${i + 1}`);
  const data = headerRow ? body.slice(1) : body;

  if (remembered?.headers && headerRow && remembered.headers.join('|').toLowerCase() === headers.join('|').toLowerCase()) return { rows: body, problems, mapping: { ...remembered, headerRow } };

  const lower = headers.map((h) => h.toLowerCase());
  const sample = data.slice(0, 40);
  const col = (i: number) => sample.map((r) => r[i] ?? '');
  const isDateCol = (i: number) => col(i).filter((v) => parseDate(v)).length >= Math.max(1, sample.length * 0.7);
  const isNumCol = (i: number) => col(i).filter((v) => v.trim() === '' || parseAmount(v) != null).length >= sample.length * 0.9 && col(i).some((v) => parseAmount(v) != null);
  const find = (re: RegExp, ok: (i: number) => boolean = () => true, not: number[] = []) => lower.findIndex((h, i) => re.test(h) && !not.includes(i) && ok(i));

  let date = find(H.date, isDateCol);
  if (date < 0) date = find(H.dateWeak, isDateCol);
  if (date < 0) date = headers.findIndex((_, i) => isDateCol(i));
  const balance = find(H.balance, isNumCol);
  let amount = find(H.amount, isNumCol, [balance]);
  let debit = -1;
  let credit = -1;
  if (amount < 0) {
    debit = find(H.debit, isNumCol, [balance]);
    credit = find(H.credit, isNumCol, [balance, debit]);
    if (debit < 0 || credit < 0) {
      const nums = headers.map((_, i) => i).filter((i) => i !== balance && i !== date && isNumCol(i));
      // two numeric columns where each row fills only one of them = money out / money in
      const exclusive = (a: number, b: number) => sample.every((r) => !((r[a] ?? '').trim() && (r[b] ?? '').trim()));
      if (debit >= 0 && credit < 0) credit = nums.find((i) => i !== debit && exclusive(debit, i)) ?? -1;
      else if (credit >= 0 && debit < 0) debit = nums.find((i) => i !== credit && exclusive(i, credit)) ?? -1;
      else if (debit < 0 && credit < 0 && nums.length === 2 && exclusive(nums[0], nums[1])) [debit, credit] = nums;
      if (debit < 0 || credit < 0) {
        debit = -1;
        credit = -1;
        if (nums.length >= 1) amount = nums[0];
      }
    }
  }
  let description = find(H.description, (i) => !isNumCol(i) && i !== date);
  if (description < 0) {
    // the column with the longest text
    let best = -1;
    let len = 0;
    headers.forEach((_, i) => {
      if (i === date || isNumCol(i)) return;
      const avg = col(i).reduce((s, v) => s + v.length, 0) / Math.max(1, sample.length);
      if (avg > len) {
        len = avg;
        best = i;
      }
    });
    description = best;
  }
  const memo = find(H.memo, (i) => !isNumCol(i), [description, date]);

  if (date < 0) problems.push('Pick the date column.');
  if (description < 0) problems.push('Pick the description column.');
  if (amount < 0 && (debit < 0 || credit < 0)) problems.push('Pick the amount column (or the money-out and money-in columns).');

  const mapping: CsvMapping = {
    date: Math.max(0, date),
    description: Math.max(0, description),
    amount: amount >= 0 ? amount : undefined,
    debit: amount < 0 && debit >= 0 ? debit : undefined,
    credit: amount < 0 && credit >= 0 ? credit : undefined,
    balance: balance >= 0 ? balance : undefined,
    extra: memo >= 0 ? [memo] : undefined,
    dateFormat: date >= 0 ? detectDateFormat(col(date)) : 'auto',
    invert: false,
    headerRow,
    headers: headerRow ? headers : undefined,
  };
  // credit card exports often list purchases as positive numbers
  if (mapping.amount != null && accountType === 'credit_card') {
    const vals = col(mapping.amount).map((v) => parseAmount(v)).filter((v): v is number => v != null && v !== 0);
    if (vals.length && vals.filter((v) => v > 0).length / vals.length > 0.6) mapping.invert = true;
  }
  return { rows: body, problems, mapping };
}

function guessSeparator(text: string): string {
  const line = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts = [',', ';', '\t', '|'].map((c) => [c, line.split(c).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function parseDelimited(text: string, sep: string): string[][] {
  // reuse the CSV parser by converting the separator outside quotes
  let out = '';
  let q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    out += !q && ch === sep ? ',' : !q && ch === ',' ? '\u0001' : ch;
  }
  return parseCSV(out).map((r) => r.map((c) => c.replace(/\u0001/g, ',')));
}

/** Header names (or "Column n") of detected rows. */
export function csvHeaders(rows: string[][], headerRow: boolean): string[] {
  const first = rows[0] ?? [];
  return headerRow ? first.map((c, i) => c.trim() || `Column ${i + 1}`) : first.map((_, i) => `Column ${i + 1}`);
}

/** Apply a mapping to CSV rows. */
export function rowsFromCsv(rows: string[][], m: CsvMapping): { rows: ParsedRow[]; skipped: number } {
  const data = m.headerRow ? rows.slice(1) : rows;
  const fmt = m.dateFormat === 'auto' ? detectDateFormat(data.slice(0, 40).map((r) => r[m.date] ?? '')) : m.dateFormat;
  const out: ParsedRow[] = [];
  let skipped = 0;
  for (const r of data) {
    const date = parseDate(r[m.date] ?? '', fmt);
    let amount: number | null = null;
    if (m.amount != null) amount = parseAmount(r[m.amount] ?? '');
    else {
      const out_ = m.debit != null ? parseAmount(r[m.debit] ?? '') : null;
      const in_ = m.credit != null ? parseAmount(r[m.credit] ?? '') : null;
      if (out_ != null || in_ != null) amount = round2((in_ != null ? Math.abs(in_) : 0) - (out_ != null ? Math.abs(out_) : 0));
    }
    const desc = [r[m.description] ?? '', ...(m.extra ?? []).map((i) => r[i] ?? '')]
      .map((x) => x.trim())
      .filter((x, i, a) => x && a.indexOf(x) === i)
      .join(' — ');
    if (!date || amount == null || !desc) {
      skipped++;
      continue;
    }
    if (m.invert) amount = -amount;
    const balance = m.balance != null ? parseAmount(r[m.balance] ?? '') : null;
    out.push({ date, description: desc, amount: round2(amount), balance: balance ?? undefined });
  }
  return { rows: out, skipped };
}

/* ---------------------------------------------------------------- OFX / QFX */

export interface OfxResult {
  rows: ParsedRow[];
  accountId?: string;
  creditCard: boolean;
  periodStart?: string;
  periodEnd?: string;
  balance?: number;
  balanceDate?: string;
}

const tag = (block: string, name: string): string | undefined => {
  const m = new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : undefined;
};

/** Read the STMTTRN transactions of an OFX / QFX file (SGML or XML). */
export function parseOfx(text: string): OfxResult {
  const rows: ParsedRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const b = raw.split(/<\/STMTTRN>/i)[0];
    const date = parseDate(tag(b, 'DTPOSTED') ?? tag(b, 'DTUSER') ?? '');
    const amount = parseAmount(tag(b, 'TRNAMT') ?? '');
    const name = tag(b, 'NAME') ?? tag(b, 'PAYEE') ?? '';
    const memo = tag(b, 'MEMO') ?? '';
    const description = [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' — ') || tag(b, 'TRNTYPE') || 'Transaction';
    if (!date || amount == null) continue;
    rows.push({ date, amount, description, fitid: tag(b, 'FITID') });
  }
  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|$)/i.exec(text)?.[1] ?? '';
  const bal = parseAmount(tag(ledger, 'BALAMT') ?? '');
  return {
    rows,
    accountId: tag(text, 'ACCTID'),
    creditCard: /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(text),
    periodStart: parseDate(tag(text, 'DTSTART') ?? '') ?? undefined,
    periodEnd: parseDate(tag(text, 'DTEND') ?? '') ?? undefined,
    balance: bal ?? undefined,
    balanceDate: parseDate(tag(ledger, 'DTASOF') ?? '') ?? undefined,
  };
}

/* ---------------------------------------------------------------- pasted statement text (PDF) */

export type SignMode = 'signed' | 'charges' | 'unsigned';
export const SIGN_MODES: { value: SignMode; label: string; hint: string }[] = [
  { value: 'signed', label: 'Signed (−45.00 = money out)', hint: 'bank statements that print withdrawals as negative numbers' },
  { value: 'charges', label: 'Card statement (purchases are positive)', hint: 'credit cards: purchases positive, payments / credits negative or CR' },
  { value: 'unsigned', label: 'No signs — guess from the words', hint: 'deposits, payroll, refunds, interest = money in; everything else = money out' },
];

const DATE_START = /^\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|[A-Za-z]{3,9}\.? \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?|\d{1,2} [A-Za-z]{3,9}\.?(?: \d{4})?)\b/;
const MONEY = /\(?-?[$£€¥]?\s?-?\d{1,3}(?:[,\s.]\d{3})*[.,]\d{2}\)?(?:\s?(?:CR|DR|-))?/gi;
const IN_WORDS = /deposit|payroll|salary|direct dep|refund|interest paid|interest earned|credit|transfer from|payment received|payment - thank|cashback|reimburse|dividend|zelle from|venmo from/i;

/** Lines with a date and an amount → rows (for text copied out of a PDF statement). */
export function parseStatementText(text: string, opts: { dateFormat?: DateFormat; signMode?: SignMode; year?: number } = {}): { rows: ParsedRow[]; skipped: number; signMode: SignMode } {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const candidates: { date: string; desc: string; raw: string; amounts: string[] }[] = [];
  const dateSamples = lines.map((l) => DATE_START.exec(l)?.[1] ?? '').filter(Boolean);
  const fmt = opts.dateFormat && opts.dateFormat !== 'auto' ? opts.dateFormat : detectDateFormat(dateSamples);
  let skipped = 0;
  for (const line of lines) {
    const dm = DATE_START.exec(line);
    if (!dm) continue;
    const date = parseDate(dm[1], fmt, opts.year);
    if (!date) continue;
    let rest = line.slice(dm[0].length).trim();
    // a second (posting) date right after the first
    const second = DATE_START.exec(rest);
    if (second && parseDate(second[1], fmt, opts.year)) rest = rest.slice(second[0].length).trim();
    const amounts = [...rest.matchAll(MONEY)].map((m) => ({ text: m[0].trim(), index: (m.index ?? 0) + m[0].length - m[0].trimStart().length }));
    if (!amounts.length) {
      skipped++;
      continue;
    }
    // amount (+ balance) at the end of the line
    const tail = amounts.slice(-2);
    const lastEnd = tail[tail.length - 1].index + tail[tail.length - 1].text.length;
    if (rest.length - lastEnd > 3) {
      skipped++;
      continue;
    }
    const descEnd = (tail.length === 2 && rest.slice(tail[0].index + tail[0].text.length, tail[1].index).trim() === '' ? tail[0] : tail[tail.length - 1]).index;
    const desc = rest.slice(0, descEnd).replace(/[\s$£€-]+$/, '').trim();
    if (!desc) {
      skipped++;
      continue;
    }
    candidates.push({ date, desc, raw: line, amounts: tail.length === 2 && descEnd === tail[0].index ? [tail[0].text, tail[1].text] : [tail[tail.length - 1].text] });
  }
  const hasNeg = candidates.some((c) => /^\(|-|CR|DR/i.test(c.amounts[0]));
  const signMode: SignMode = opts.signMode ?? (hasNeg ? 'signed' : 'unsigned');
  const rows: ParsedRow[] = [];
  for (const c of candidates) {
    let a = parseAmount(c.amounts[0]);
    if (a == null) {
      skipped++;
      continue;
    }
    if (signMode === 'charges') a = -a;
    else if (signMode === 'unsigned') a = IN_WORDS.test(c.desc) ? Math.abs(a) : -Math.abs(a);
    const balance = c.amounts[1] ? parseAmount(c.amounts[1]) ?? undefined : undefined;
    rows.push({ date: c.date, description: c.desc, amount: a, balance });
  }
  return { rows, skipped, signMode };
}

/* ---------------------------------------------------------------- categorise & dedupe */

const normDesc = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

export function dedupeKey(accountId: string | undefined, date: string, amount: number, description: string): string {
  return `${accountId ?? ''}|${date}|${Math.round(amount * 100)}|${normDesc(description)}`;
}

export function ruleMatches(r: FinRule, description: string, accountId?: string): boolean {
  if (!r.match.trim()) return false;
  if (r.accountId && r.accountId !== accountId) return false;
  const d = description.toLowerCase();
  const m = r.match.toLowerCase().trim();
  switch (r.matchType) {
    case 'starts_with':
      return d.startsWith(m);
    case 'exact':
      return d.trim() === m;
    case 'regex':
      try {
        return new RegExp(r.match, 'i').test(description);
      } catch {
        return false;
      }
    default:
      return d.includes(m);
  }
}

/** `kw` occurs in `text` starting at a word boundary ("ups" matches "UPS Store", not "groups"). */
function hasWord(text: string, kw: string): boolean {
  let i = text.indexOf(kw);
  while (i >= 0) {
    if (i === 0 || !/[a-z0-9]/.test(text[i - 1]) || !/[a-z0-9]/.test(kw[0])) return true;
    i = text.indexOf(kw, i + 1);
  }
  return false;
}

export interface Categorized {
  category?: string;
  merchant?: string;
  transfer?: boolean;
  recurring?: boolean;
  /** what decided it */
  by?: 'rule' | 'keyword';
}

/** Category (and clean name) for a description: rules first, then category keywords. */
export function categorize(f: Pick<FinanceData, 'rules' | 'categories'>, description: string, amount: number, accountId?: string): Categorized {
  const out: Categorized = {};
  for (const r of f.rules) {
    if (!ruleMatches(r, description, accountId)) continue;
    if (r.category && !out.category && f.categories.some((c) => c.id === r.category)) {
      out.category = r.category;
      out.by = 'rule';
    }
    if (r.rename && !out.merchant) out.merchant = r.rename;
    if (r.transfer) out.transfer = true;
    if (r.recurring) out.recurring = true;
  }
  if (out.category) return out;
  const d = ` ${description.toLowerCase().replace(/\s+/g, ' ')} `;
  let best: { id: string; len: number; pref: number } | null = null;
  for (const c of f.categories) {
    if (amount < 0 && c.kind === 'income') continue;
    // money in: prefer income / transfer words; spending categories only as refunds
    const pref = amount > 0 ? (c.kind === 'income' || c.kind === 'transfer' ? 2 : 1) : 2;
    for (const k of c.keywords ?? []) {
      const kw = k.toLowerCase();
      if (!kw.trim() || !hasWord(d, kw)) continue;
      const len = kw.trim().length;
      if (!best || pref > best.pref || (pref === best.pref && len > best.len)) best = { id: c.id, len, pref };
    }
  }
  if (best) {
    out.category = best.id;
    out.by = 'keyword';
  }
  return out;
}

export interface ReviewRow extends ParsedRow {
  key: string;
  duplicate: boolean;
  include: boolean;
  transfer?: boolean;
  recurring?: boolean;
  categorizedBy?: 'rule' | 'keyword' | 'agent';
}

/** Mark duplicates (against the account's existing transactions) and auto-categorise. */
export function prepareImport(rows: ParsedRow[], accountId: string | undefined, f: FinanceData): ReviewRow[] {
  const counts = new Map<string, number>();
  const fitids = new Set<string>();
  for (const t of f.transactions) {
    if ((t.accountId ?? '') !== (accountId ?? '')) continue;
    const k = dedupeKey(accountId, t.date, t.amount, t.description);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (t.hash?.startsWith('fitid:')) fitids.add(t.hash);
  }
  const catIds = new Set(f.categories.map((c) => c.id));
  const catByName = new Map(f.categories.map((c) => [c.name.toLowerCase(), c.id]));
  return rows.map((r, i) => {
    let duplicate = false;
    if (r.fitid && fitids.has(`fitid:${r.fitid}`)) duplicate = true;
    else {
      const k = dedupeKey(accountId, r.date, r.amount, r.description);
      const n = counts.get(k) ?? 0;
      if (n > 0) {
        duplicate = true;
        counts.set(k, n - 1);
      }
    }
    const given = r.category ? (catIds.has(r.category) ? r.category : catByName.get(r.category.toLowerCase())) : undefined;
    const auto = categorize(f, r.description, r.amount, accountId);
    return {
      ...r,
      key: `r${i}`,
      duplicate,
      include: !duplicate,
      category: given ?? auto.category,
      merchant: r.merchant ?? auto.merchant,
      transfer: auto.transfer || (given ?? auto.category) === 'transfers' || undefined,
      recurring: auto.recurring,
      categorizedBy: given ? 'agent' : auto.by,
    };
  });
}

/** Period covered by rows. */
export function rowsPeriod(rows: { date: string }[]): { from?: string; to?: string } {
  if (!rows.length) return {};
  const ds = rows.map((r) => r.date).sort();
  return { from: ds[0], to: ds[ds.length - 1] };
}

/** Last balance printed in the rows (statement closing balance), if any. */
export function closingBalance(rows: ParsedRow[]): { balance: number; date: string } | null {
  let best: ParsedRow | null = null;
  for (const r of rows) if (r.balance != null && (!best || r.date >= best.date)) best = r;
  return best && best.balance != null ? { balance: best.balance, date: best.date } : null;
}

export function isTransactionLike(t: Partial<FinTransaction>): boolean {
  return typeof t.date === 'string' && typeof t.amount === 'number';
}

/** Statement file kind from its name. */
export function fileKind(name: string): 'csv' | 'ofx' | 'pdf' | 'text' | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'ofx' || ext === 'qfx' || ext === 'qbo') return 'ofx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'txt') return 'text';
  return null;
}

/** Decode file bytes as text (UTF-8, falling back to Latin-1). */
export function bytesToText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

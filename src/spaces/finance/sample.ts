/* Sample finance data for the self-test and demos: fictional people, banks and
   numbers. About four months of activity ending today on a checking account,
   a savings account and a credit card, with recurring bills and
   subscriptions, budgets, two goals, two imported statements (no files) and a
   couple of saved agent notes. Deterministic for a given `today`. */
import { pad2, todayISO } from '@/lib/dates';
import type { FinAccount, FinanceData, FinTransaction } from './types';
import { normalizeFinance } from './types';
import { addMonthsISO, monthLabel, shiftMonth } from './calc';
import { ccPaymentId, computeBudget, readyToAssign } from './ynab';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function sampleFinance(today: string = todayISO()): FinanceData {
  const f = normalizeFinance({});
  const rand = rng(20261018);
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

  const accounts: FinAccount[] = [
    { id: 'acct_checking', name: 'Everyday Checking', type: 'checking', institution: 'Harbor Bank', last4: '4821', balance: 3240.18, balanceDate: today, slot: 0 },
    { id: 'acct_savings', name: 'High-Yield Savings', type: 'savings', institution: 'Northwind Savings', last4: '7710', balance: 8600, balanceDate: today, apr: 4.1, slot: 2, onBudget: false, notes: 'Tracking account: money moved here leaves the budget through the Savings category.' },
    { id: 'acct_card', name: 'Summit Rewards Visa', type: 'credit_card', institution: 'Summit Card Co.', last4: '9015', balance: 1842.55, balanceDate: today, creditLimit: 6000, apr: 24.99, minPayment: 55, statementDay: 21, slot: 1 },
  ];
  f.accounts = accounts;
  f.settings.defaultAccountId = 'acct_checking';
  f.settings.extraDebtPayment = 200;

  const cur = today.slice(0, 7);
  const months = [shiftMonth(cur, -3), shiftMonth(cur, -2), shiftMonth(cur, -1), cur];
  const lastMonth = months[2];
  const stmtCard = 'stmt_sample_card';
  const stmtChecking = 'stmt_sample_checking';
  const txs: FinTransaction[] = [];
  let n = 0;
  const day = (key: string, d: number) => {
    const last = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
    return `${key}-${pad2(Math.min(Math.max(1, Math.round(d)), last))}`;
  };
  const add = (key: string, d: number, description: string, amount: number, accountId: string, category?: string, extra: Partial<FinTransaction> = {}) => {
    const date = day(key, d);
    if (date > today) return;
    const statementId = key === lastMonth ? (accountId === 'acct_card' ? stmtCard : accountId === 'acct_checking' ? stmtChecking : undefined) : undefined;
    txs.push({ id: `tx_s${++n}`, date, description, amount: Math.round(amount * 100) / 100, accountId, ...(category ? { category } : {}), ...(statementId ? { statementId } : {}), ...extra });
  };

  months.forEach((key, mi) => {
    // income
    add(key, 1, 'ACME STUDIOS PAYROLL DIR DEP', 2450, 'acct_checking', 'income', { merchant: 'Acme Studios (salary)', recurring: true });
    add(key, 15, 'ACME STUDIOS PAYROLL DIR DEP', 2450, 'acct_checking', 'income', { merchant: 'Acme Studios (salary)', recurring: true });
    add(key, 10 + mi * 3, 'STRIPE TRANSFER ST-8H2K', between(560, 1250), 'acct_checking', 'income', { merchant: 'Freelance (Stripe)' });
    add(key, 28, 'INTEREST PAID', between(27, 31), 'acct_savings', 'income');
    // housing & bills
    add(key, 1, 'OAKWOOD APARTMENTS RENT ACH', -1850, 'acct_checking', 'housing', { merchant: 'Oakwood Apartments', recurring: true });
    add(key, 8, 'PG&E ELECTRIC WEB PMT', -between(78, 112), 'acct_checking', 'utilities', { merchant: 'PG&E' });
    add(key, 12, 'COMCAST XFINITY INTERNET', -79.99, 'acct_checking', 'utilities', { merchant: 'Xfinity Internet' });
    add(key, 18, 'T-MOBILE AUTOPAY', -65, 'acct_checking', 'utilities', { merchant: 'T-Mobile' });
    // savings & card payment
    add(key, 2, 'ONLINE TRANSFER TO SAVINGS XXXX7710', -500, 'acct_checking', 'savings', { merchant: 'Transfer to savings' });
    add(key, 2, 'ONLINE TRANSFER FROM CHECKING XXXX4821', 500, 'acct_savings', 'transfers', { transfer: true, merchant: 'Transfer from checking' });
    add(key, 23, 'PAYMENT TO SUMMIT CARD XXXX9015', -1200, 'acct_checking', 'transfers', { transfer: true, merchant: 'Summit card payment' });
    add(key, 23, 'PAYMENT THANK YOU', 1200, 'acct_card', 'transfers', { transfer: true, merchant: 'Summit card payment' });
    add(key, 21, 'INTEREST CHARGE ON PURCHASES', -between(34, 41), 'acct_card', 'fees');
    // subscriptions
    add(key, 5, 'NETFLIX.COM', -15.49, 'acct_card', 'subscriptions', { merchant: 'Netflix' });
    add(key, 9, 'SPOTIFY USA', -11.99, 'acct_card', 'subscriptions', { merchant: 'Spotify' });
    add(key, 14, 'APPLE.COM/BILL ICLOUD', -2.99, 'acct_card', 'subscriptions', { merchant: 'iCloud+' });
    add(key, 20, 'ADOBE *CREATIVE CLOUD', -59.99, 'acct_card', 'subscriptions', { merchant: 'Adobe Creative Cloud' });
    add(key, 3, 'OPENAI *CHATGPT SUBSCR', -20, 'acct_card', 'subscriptions', { merchant: 'ChatGPT Plus' });
    add(key, 16, 'FRAME.IO SUBSCRIPTION', -15, 'acct_card', 'business', { merchant: 'Frame.io' });
    if (mi >= 2) add(key, 6, 'PELOTON MEMBERSHIP', -44, 'acct_card', 'subscriptions', { merchant: 'Peloton' });
    // groceries (weekly)
    for (const d of [3, 10, 17, 24, 30]) add(key, d + Math.floor(rand() * 2), pick(["TRADER JOE'S #552", 'WHOLE FOODS MKT 10234', 'SAFEWAY #1781']), -between(42, 128), 'acct_card', 'groceries');
    // dining (more this month → over budget)
    const meals = mi === 3 ? 11 : 8;
    for (let i = 0; i < meals; i++) add(key, 2 + Math.floor(rand() * 27), pick(['SQ *BLUE BOTTLE COFFEE', 'DOORDASH*THAI BASIL', 'CHIPOTLE 2291', 'TST* THE GOOD DINER', 'SWEETGREEN MISSION', 'STARBUCKS STORE 0423']), -between(6, mi === 3 ? 68 : 46), 'acct_card', 'dining');
    // transport
    for (let i = 0; i < 3; i++) add(key, 4 + i * 9, 'UBER *TRIP HELP.UBER.COM', -between(11, 34), 'acct_card', 'transport', { merchant: 'Uber' });
    add(key, 7, 'SHELL OIL 57444', -between(44, 61), 'acct_card', 'transport', { merchant: 'Shell' });
    add(key, 21, 'CLIPPER TRANSIT', -40, 'acct_checking', 'transport', { merchant: 'Clipper' });
    // shopping
    for (let i = 0; i < 3; i++) add(key, 6 + i * 8, 'AMZN Mktp US*2K4L19', -between(14, 92), 'acct_card', 'shopping', { merchant: 'Amazon' });
    add(key, 19, 'TARGET 00012', -between(28, 84), 'acct_card', 'shopping', { merchant: 'Target' });
    // health & fun
    add(key, 11, 'CVS/PHARMACY #04429', -between(12, 31), 'acct_card', 'health', { merchant: 'CVS Pharmacy' });
    if (mi % 2 === 0) add(key, 26, 'AMC THEATRES 4471', -28.5, 'acct_card', 'entertainment', { merchant: 'AMC Theatres' });
  });
  // one-offs
  add(months[2], 13, 'DELTA AIR LINES 0062', -412.4, 'acct_card', 'travel', { merchant: 'Delta Air Lines' });
  add(months[2], 14, 'AIRBNB * HMQ8XZ', -618, 'acct_card', 'travel', { merchant: 'Airbnb' });
  add(months[1], 9, 'B&H PHOTO VIDEO', -349, 'acct_card', 'business', { merchant: 'B&H Photo', notes: 'Wireless lav kit for the podcast' });
  add(months[3], Math.max(1, Number(today.slice(8, 10)) - 2), 'REI #0112 BERKELEY', -186.2, 'acct_card', 'shopping', { merchant: 'REI' });
  add(months[3], Math.max(1, Number(today.slice(8, 10)) - 1), 'SQ *CORNER BAKERY', -9.75, 'acct_card');
  add(months[3], Math.max(1, Number(today.slice(8, 10))), 'VENMO PAYMENT 1043', -60, 'acct_checking');
  f.transactions = txs.sort((a, b) => a.date.localeCompare(b.date));

  f.statements = [
    { id: stmtCard, accountId: 'acct_card', name: `Summit Rewards Visa — ${monthLabel(lastMonth)}`, periodStart: `${lastMonth}-01`, periodEnd: day(lastMonth, 31), format: 'csv', importedCount: txs.filter((t) => t.statementId === stmtCard).length, duplicateCount: 0, importedAt: `${cur}-02T09:14:00.000Z`, source: 'upload' },
    { id: stmtChecking, accountId: 'acct_checking', name: `Everyday Checking — ${monthLabel(lastMonth)}`, periodStart: `${lastMonth}-01`, periodEnd: day(lastMonth, 31), format: 'agent', importedCount: txs.filter((t) => t.statementId === stmtChecking).length, duplicateCount: 2, importedAt: `${cur}-03T18:40:00.000Z`, source: 'agent', notes: 'Imported by an AI agent from the e-statement email.' },
  ];

  f.rules = [
    { id: 'rule_s1', match: 'PELOTON', matchType: 'contains', category: 'subscriptions', rename: 'Peloton', recurring: true },
    { id: 'rule_s2', match: 'OAKWOOD APARTMENTS', matchType: 'contains', category: 'housing', rename: 'Oakwood Apartments', recurring: true },
    { id: 'rule_s3', match: 'PAYMENT TO SUMMIT', matchType: 'starts_with', category: 'transfers', rename: 'Summit card payment', transfer: true },
  ];

  // checking balance = a 2,400 starting balance + everything since (so "Starting balances" in the budget is 2,400)
  accounts[0].balance = Math.round((2400 + txs.filter((t) => t.accountId === 'acct_checking').reduce((s, t) => s + t.amount, 0)) * 100) / 100;

  // YNAB-style budget: targets, then assignments for the last 3 months and this month
  const cc = ccPaymentId('acct_card');
  f.targets = [
    { id: 'tgt_s1', categoryId: 'housing', type: 'monthly', amount: 1850 },
    { id: 'tgt_s2', categoryId: 'utilities', type: 'refill', amount: 260 },
    { id: 'tgt_s3', categoryId: 'groceries', type: 'monthly', amount: 600 },
    { id: 'tgt_s4', categoryId: 'dining', type: 'monthly', amount: 260 },
    { id: 'tgt_s5', categoryId: 'transport', type: 'monthly', amount: 220 },
    { id: 'tgt_s6', categoryId: 'subscriptions', type: 'monthly', amount: 180 },
    { id: 'tgt_s7', categoryId: 'shopping', type: 'monthly', amount: 250 },
    { id: 'tgt_s8', categoryId: 'health', type: 'refill', amount: 80 },
    { id: 'tgt_s9', categoryId: 'travel', type: 'by_date', amount: 1500, date: shiftMonth(cur, 8), repeatMonths: 12, notes: 'Summer trip home + one long weekend' },
    { id: 'tgt_s10', categoryId: 'savings', type: 'monthly', amount: 500, notes: 'Monthly transfer to High-Yield Savings (emergency fund)' },
    { id: 'tgt_s11', categoryId: 'fees', type: 'monthly', amount: 40 },
    { id: 'tgt_s12', categoryId: 'business', type: 'monthly', amount: 80 },
    { id: 'tgt_s13', categoryId: cc, type: 'monthly', amount: 200, notes: 'Extra on top of the card spending — clears the old balance' },
  ];
  const base: Record<string, number> = { housing: 1850, utilities: 230, groceries: 600, dining: 260, transport: 220, subscriptions: 180, shopping: 250, health: 60, entertainment: 40, business: 80, fees: 40, savings: 500, [cc]: 200 };
  const travel = [300, 300, 450, 100];
  f.assignments = [];
  months.forEach((key, mi) => {
    for (const [categoryId, assigned] of Object.entries(base)) f.assignments.push({ month: key, categoryId, assigned: mi === 1 && categoryId === 'business' ? 430 : assigned });
    f.assignments.push({ month: key, categoryId: 'travel', assigned: travel[mi] });
  });
  // the rest of the money that came in got a job last month (the emergency fund) — leave a little to assign now
  // dining is overspent this month (on the card); utilities ran a little over in cash
  f.assignments.push({ month: cur, categoryId: 'dining', assigned: -200 });
  const before = readyToAssign(computeBudget(f, cur, today), cur);
  if (before.leftOver > 300) f.assignments.push({ month: lastMonth, categoryId: 'savings', assigned: Math.round(before.leftOver - 150) });
  const after = readyToAssign(computeBudget({ ...f, assignments: [...f.assignments] }, cur, today), cur);
  if (after.rta > 800) f.assignments.push({ month: cur, categoryId: 'savings', assigned: Math.round(after.rta - 420) });
  // merge the duplicate rows
  f.assignments = normalizeFinance({ ...f, assignments: f.assignments }).assignments;

  f.goals = [
    { id: 'goal_s1', name: 'Emergency fund (6 months)', type: 'emergency_fund', target: 18000, current: 0, accountId: 'acct_savings', monthly: 500, targetDate: addMonthsISO(today, 20), startDate: addMonthsISO(today, -8), slot: 2 },
    { id: 'goal_s2', name: 'New camera body', type: 'purchase', target: 2800, current: 950, monthly: 200, targetDate: addMonthsISO(today, 8), slot: 1, notes: 'Mirrorless body for the channel; sell the old one for ~$600.' },
  ];

  f.insights = [
    {
      id: 'ins_s1',
      title: 'Clear the Summit card before adding to investments',
      body: 'Your card charges 24.99% APR, about $38 a month in interest. Moving the extra $200 you planned for investing onto the card would clear it in roughly 8 months instead of 2+ years and save around $500 in interest. Keep the $500 monthly transfer to savings for the emergency fund.',
      source: 'agent',
      author: 'Claude',
      kind: 'opportunity',
      date: `${cur}-03`,
      pinned: true,
    },
    {
      id: 'ins_s2',
      title: 'Subscription check-in',
      body: 'Six subscriptions add up to about $155 a month. Peloton is new since last month; Adobe and Frame.io overlap with your business costs — consider moving them to a business card.',
      source: 'agent',
      author: 'Claude',
      kind: 'tip',
      date: `${cur}-03`,
    },
  ];
  return f;
}

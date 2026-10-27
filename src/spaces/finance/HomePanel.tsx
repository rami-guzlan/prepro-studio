/* Library tab "Personal Finances". Locked: a lock card (never any numbers).
   Unlocked: a few headline numbers and an Open button. First time: what the
   feature does and how the PIN protects it. */
import './finance.css';
import { useEffect, useState } from 'react';
import { Bot, FileUp, KeyRound, LockKeyhole, PiggyBank, ShieldCheck, Unlock, Wallet } from 'lucide-react';
import { backend } from '@/backend';
import { todayISO } from '@/lib/dates';
import { makeFormatters } from '@/lib/format';
import { openSingleton } from '@/shell/spaceActions';
import { StatTile } from '@/ui/charts';
import { Button } from '@/ui';
import type { SpaceData } from '../types';
import { lockFinances, requestFinanceUnlock, useFinanceLock } from './lock';
import { normalizeFinance } from './types';
import { catMap, monthLabel, monthOf, netWorth, totals, txOfMonth } from './calc';

const open = async () => {
  if (await requestFinanceUnlock()) await openSingleton('finance');
};

function Points() {
  return (
    <div className="fin-home-points">
      <div className="fin-home-point">
        <FileUp size={16} />
        <span>
          <b>Import statements</b>CSV, OFX/QFX and PDF from any bank or card; duplicates skipped, auto-categorised.
        </span>
      </div>
      <div className="fin-home-point">
        <PiggyBank size={16} />
        <span>
          <b>Budget every dollar</b>A YNAB-style zero-based budget with targets, plus goals, debt payoff and savings projections.
        </span>
      </div>
      <div className="fin-home-point">
        <Bot size={16} />
        <span>
          <b>Your agents help</b>Connected AI agents can find statements in your email, import them and leave advice, even while the screen is locked.
        </span>
      </div>
      <div className="fin-home-point">
        <ShieldCheck size={16} />
        <span>
          <b>Screen lock</b>A PIN hides your numbers on screen. Locks after 15 minutes idle or when the app closes.
        </span>
      </div>
    </div>
  );
}

export default function FinanceHomePanel() {
  const unlocked = useFinanceLock((s) => s.unlocked);
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [space, setSpace] = useState<SpaceData | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void backend.financePin
      .status()
      .then((s) => alive && setPinSet(s.set))
      .catch(() => alive && setPinSet(false));
    return () => {
      alive = false;
    };
  }, [unlocked]);

  // load numbers only while unlocked
  useEffect(() => {
    let alive = true;
    if (!unlocked) {
      setSpace(undefined);
      return;
    }
    void (async () => {
      try {
        const hit = (await backend.listSpaces()).find((x) => x.kind === 'finance');
        const s = hit ? await backend.loadSpace(hit.id) : null;
        if (alive) setSpace(s);
      } catch {
        if (alive) setSpace(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [unlocked]);

  if (!unlocked) {
    const first = pinSet === false;
    return (
      <div className="fin-home">
        <div className="fin-home-lock">
          <span className="fin-home-lockicon">{first ? <KeyRound size={26} /> : <LockKeyhole size={26} />}</span>
          <div>
            <h2>{first ? 'Set up Personal Finances' : 'Personal Finances are locked'}</h2>
            <p>
              {first
                ? 'Bring your bank and card statements together to see where your money goes, budget, plan goals and pay down debt. First, choose a PIN: it locks this section on your screen.'
                : 'Enter your PIN to see your accounts, spending and plans.'}
            </p>
            <Button variant="primary" icon={first ? KeyRound : Unlock} onClick={() => void open()} disabled={pinSet == null}>
              {first ? 'Create a PIN and start' : 'Unlock'}
            </Button>
          </div>
        </div>
        {first && <Points />}
      </div>
    );
  }

  const f = space ? normalizeFinance(space.finance) : null;
  const empty = !f || (!f.transactions.length && !f.accounts.length);
  if (space === undefined) return <div className="muted">Loading…</div>;
  const fmt = makeFormatters(space?.settings as never);
  const money0 = (n: number) => fmt.money(n, { cents: false });
  const today = todayISO();
  const sd = f?.settings.monthStartDay ?? 1;
  const month = monthOf(today, sd);
  const t = f ? totals(txOfMonth(f.transactions, month, sd), catMap(f)) : null;
  const nw = f ? netWorth(f.accounts) : null;

  return (
    <div className="fin-home">
      <div className="fin-home-lock">
        <span className="fin-home-lockicon">
          <Wallet size={26} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>Personal Finances</h2>
          <p>{empty ? 'Unlocked. Add your accounts and import your first statements to get started.' : `Unlocked · ${monthLabel(month, true)} so far.`}</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" icon={Wallet} onClick={() => void openSingleton('finance')}>
              {empty ? 'Get started' : 'Open'}
            </Button>
            <Button icon={LockKeyhole} onClick={() => lockFinances()}>
              Lock
            </Button>
          </div>
        </div>
      </div>
      {!empty && t && nw && (
        <div className="fin-tiles">
          <StatTile label="Income this month" value={money0(t.income)} />
          <StatTile label="Spent this month" value={money0(t.spending)} />
          <StatTile label="Net" value={`${t.net < 0 ? '−' : '+'}${money0(Math.abs(t.net))}`} deltaGood={t.net >= 0} />
          <StatTile label="Net worth" value={money0(nw.net)} sub={`${f!.accounts.filter((a) => !a.archived).length} accounts`} />
        </div>
      )}
      {empty && <Points />}
    </div>
  );
}

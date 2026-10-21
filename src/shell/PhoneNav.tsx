/* Phone chrome for the workspaces: a bottom tab bar with the most used modules of
   each kind plus "More" (opens the sidebar as a drawer), and the drawer's backdrop.
   Both are hidden on desktop by src/styles/phone.css. */
import { useEffect } from 'react';
import { Menu as MenuIcon, type LucideIcon } from 'lucide-react';
import { setNavOpen, useApp } from '@/store/app';

/** Bottom tabs per workspace: module id, optionally with a shorter label. */
export const PHONE_TABS: Record<string, { id: string; label?: string }[]> = {
  project: [{ id: 'overview' }, { id: 'script' }, { id: 'shots', label: 'Shots' }, { id: 'schedule', label: 'Schedule' }],
  marketing: [{ id: 'overview' }, { id: 'content' }, { id: 'calendar' }, { id: 'ideas' }],
  business: [{ id: 'overview' }, { id: 'invoices' }, { id: 'expenses' }, { id: 'time' }],
  finance: [{ id: 'overview' }, { id: 'transactions', label: 'Spending' }, { id: 'budgets' }, { id: 'advice' }],
  training: [{ id: 'overview', label: 'Today' }, { id: 'workouts' }, { id: 'nutrition', label: 'Meals' }, { id: 'photos' }],
};

export interface PhoneTab {
  id: string;
  label: string;
  icon: LucideIcon;
}

export function PhoneTabBar({ tabs, active, onSelect }: { tabs: PhoneTab[]; active: string; onSelect: (id: string) => void }) {
  const navOpen = useApp((s) => s.navOpen);
  const inTabs = tabs.some((t) => t.id === active);
  return (
    <nav className="phone-tabs" aria-label="Sections">
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button key={t.id} className={active === t.id && !navOpen ? 'on' : ''} onClick={() => onSelect(t.id)} aria-current={active === t.id ? 'page' : undefined}>
            <Icon />
            <span>{t.label}</span>
          </button>
        );
      })}
      <button className={navOpen || !inTabs ? 'on' : ''} onClick={() => setNavOpen(!navOpen)} aria-label="All sections">
        <MenuIcon />
        <span>More</span>
      </button>
    </nav>
  );
}

/** Tap-outside area behind the open drawer; also closes it on Escape and on leaving phone width. */
export function PhoneNavBackdrop() {
  const navOpen = useApp((s) => s.navOpen);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);
  return <div className="phone-backdrop" onClick={() => setNavOpen(false)} aria-hidden />;
}

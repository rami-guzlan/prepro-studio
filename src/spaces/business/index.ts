/* Kind definition of 'business' spaces: sidebar modules, print documents, coach summary. */
import { lazy } from 'react';
import { BookOpenCheck, Clapperboard, Clock, Compass, Film, FileSignature, FileText, FolderKanban, Gauge, HandCoins, Library, Lightbulb, MessageSquareQuote, Presentation, Receipt, Rocket, Target, UserRound, UsersRound } from 'lucide-react';
import type { SpaceKindDef } from '../kinds';
import { bizOf, arAging, invoiceTotal, minutesIn, periodRange, profitLoss, totalOwedToContractors, unbilledEntries, entryValue, sumAmount, upcoming, weekStartOf, round2 } from './derive';
import { addDays } from '@/lib/dates';
import { businessPrintDocs } from './print';
import { salesPrintDocs } from './print-sales';
import { workPrintDocs } from './print-work';
import { libraryPrintDocs } from './print-library';
import { spacePrintDocs as ideasPrintDocs } from '../modules/ideas/print';

export const businessKind: SpaceKindDef = {
  groups: ['Overview', 'Sales', 'Work', 'Money', 'People', 'Legal', 'Library'],
  modules: [
    { id: 'overview', label: 'Overview', group: 'Overview', icon: Gauge, description: 'Income, sales and projects at a glance', component: lazy(() => import('./modules/overview')) },
    { id: 'strategy', label: 'Strategy', group: 'Overview', icon: Compass, description: 'Mission, positioning, offers, goals, priorities, SWOT', component: lazy(() => import('./modules/strategy')) },
    { id: 'ideas', label: 'Ideas', group: 'Overview', icon: Lightbulb, description: 'Brainstorm board: get it all out, then turn the best into initiatives, offers or leads', component: lazy(() => import('./modules/ideas')) },
    { id: 'growth', label: 'Growth', group: 'Overview', icon: Rocket, description: 'Growth initiatives with KPIs, budget and check-ins', component: lazy(() => import('./modules/growth')) },
    { id: 'pipeline', label: 'Sales Pipeline', group: 'Sales', icon: Target, description: 'Leads and deals from first contact to won', component: lazy(() => import('./modules/pipeline')) },
    { id: 'enablement', label: 'Sales Enablement', group: 'Sales', icon: Presentation, description: 'Pitch decks, case studies, pricing, scripts, email templates', component: lazy(() => import('./modules/enablement')) },
    { id: 'testimonials', label: 'Testimonials', group: 'Sales', icon: MessageSquareQuote, description: 'What clients say, with permission to use it', component: lazy(() => import('./modules/testimonials')) },
    { id: 'portfolio', label: 'Portfolio & Reels', group: 'Sales', icon: Film, description: 'Showreels, work samples and case studies', component: lazy(() => import('./modules/portfolio')) },
    { id: 'projects', label: 'Projects', group: 'Work', icon: FolderKanban, description: 'Client work: plan, tasks, money, contractors, documents', component: lazy(() => import('./modules/projects')) },
    { id: 'linked', label: 'Marketing & Productions', group: 'Work', icon: Clapperboard, description: 'Linked Marketing Spaces and productions', component: lazy(() => import('./modules/linked')) },
    { id: 'invoices', label: 'Invoices', group: 'Money', icon: FileText, description: 'Numbered invoices, payments and PDFs', component: lazy(() => import('./modules/invoices')) },
    { id: 'income', label: 'Income', group: 'Money', icon: HandCoins, description: 'Income streams and money received', component: lazy(() => import('./modules/income')) },
    { id: 'expenses', label: 'Expenses', group: 'Money', icon: Receipt, description: 'Costs, categories and receipts', component: lazy(() => import('./modules/expenses')) },
    { id: 'time', label: 'Time', group: 'Money', icon: Clock, description: 'Timer, timesheets and unbilled time', component: lazy(() => import('./modules/time')) },
    { id: 'clients', label: 'Clients', group: 'People', icon: UserRound, description: 'Who pays you, rates and totals', component: lazy(() => import('./modules/clients')) },
    { id: 'contractors', label: 'Contractors', group: 'People', icon: UsersRound, description: 'Who you pay: agreed rates and pay log', component: lazy(() => import('./modules/contractors')) },
    { id: 'legal', label: 'Legal Documents', group: 'Legal', icon: FileSignature, description: 'Contracts, NDAs, releases and their status', component: lazy(() => import('./modules/legal')) },
    { id: 'sops', label: 'Workflows & SOPs', group: 'Library', icon: BookOpenCheck, description: 'Step-by-step procedures and checklists you can run', component: lazy(() => import('./modules/sops')) },
    { id: 'resources', label: 'Resources', group: 'Library', icon: Library, description: 'Templates, brand assets, files and links you reuse', component: lazy(() => import('./modules/resources')) },
  ],
  printDocs: [...businessPrintDocs, ...ideasPrintDocs.map((d) => ({ ...d, id: 'space-biz-ideas', group: 'Strategy' as const })), ...salesPrintDocs, ...workPrintDocs, ...libraryPrintDocs],
  navParams: {
    overview: 'card ("profile" | "settings" | "links")',
    strategy: 'section ("plan" | "offers" | "goals" | "priorities" | "swot" | "competitors")',
    ideas: '(none; use the mind_* tools for the board)',
    growth: 'initiativeId, or new: true',
    pipeline: 'dealId, or new: true; stage (filter), followUps: true',
    enablement: 'resourceId, category, or new: true',
    testimonials: 'testimonialId, clientId (filter), or new: true',
    portfolio: 'itemId, kind (filter), or new: true',
    projects: 'projectId; or new: true with clientId, dealId, name; view ("list" | "board" | "timeline"); status ("open" | "all" | a status)',
    linked: '(none)',
    sops: 'sopId, or new: true',
    resources: 'resourceId, or new: true with kind ("text" | "file" | "link")',
    invoices: 'invoiceId (id or number), or new: true with clientId, bizProjectId, title, lines [{description, qty, unitPrice}]',
    income: 'tab ("entries" | "streams")',
    expenses: 'expenseId, category',
    time: 'entryId',
    clients: 'clientId',
    contractors: 'contractorId',
    legal: 'docId, or template (contractor | nda | sow | services | collab | release | sponsorship | payment_plan) to start a new document',
  },
  coachSummary(s, today) {
    const b = bizOf(s);
    const month = profitLoss(b, periodRange('this_month', today));
    const ytd = profitLoss(b, periodRange('ytd', today));
    const ar = arAging(b, today);
    const week = { from: weekStartOf(today, s.settings.weekStartsMonday), to: addDays(weekStartOf(today, s.settings.weekStartsMonday), 6) };
    const mins = minutesIn(b, week);
    const unbilled = unbilledEntries(b);
    const due = upcoming(b, today, 14);
    return {
      business: s.meta.title,
      type: b.profile.type,
      currency: s.settings.currency,
      month: { income: month.income, expenses: month.expenses, profit: month.profit },
      yearToDate: { income: ytd.income, expenses: ytd.expenses, profit: ytd.profit },
      receivables: { open: ar.openCount, outstanding: ar.total, overdueCount: ar.overdueCount, overdue: ar.overdue },
      draftInvoices: b.invoices.filter((i) => i.status === 'draft').length,
      owedToContractors: totalOwedToContractors(b),
      hoursThisWeek: Math.round((mins / 60) * 10) / 10,
      unbilled: { hours: Math.round((unbilled.reduce((n, e) => n + e.minutes, 0) / 60) * 10) / 10, value: sumAmount(unbilled.map((e) => ({ amount: entryValue(b, e) }))) },
      timerRunning: !!b.timer,
      activeStreams: b.streams.filter((x) => x.active).map((x) => x.name),
      expectedMonthly: round2(b.streams.filter((x) => x.active).reduce((n, x) => n + (x.expectedMonthly ?? 0), 0)),
      clients: b.clients.filter((c) => !c.archived).length,
      activeContractors: b.contractors.filter((c) => c.active).length,
      pendingSignatures: b.docs.filter((d) => d.status === 'sent').length,
      dueNext14Days: due.slice(0, 6).map((d) => ({ date: d.date, what: d.label, amount: d.amount, overdue: d.overdue || undefined })),
      largestOpenInvoice: b.invoices.filter((i) => i.status === 'sent').map((i) => ({ number: i.number, total: invoiceTotal(i), due: i.dueDate })).sort((a, z) => z.total - a.total)[0],
      linked: { marketingSpaces: s.spaceIds?.length ?? 0, productions: s.projectIds.length },
    };
  },
};

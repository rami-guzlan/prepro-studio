/* Printable People & Brands: every sheet (or the ones picked) as a table. */
import type { SpacePrintDocDef } from '@/spaces/print/types';
import type { CrmColumn, CrmRow } from '@/spaces/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { PBadge, PSection, PTable } from '@/print/components';
import { displayValue, dueRows, optionOf } from '@/spaces/crm';

const CSS = `
.crm-desc { color: #66666f; font-size: 8pt; margin: -2pt 0 5pt; }
.crm-due { color: #d93036; font-weight: 700; }
.crm-sheet { margin-bottom: 12pt; }
`;

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-people',
    title: 'People & Brands',
    group: 'Results',
    orientation: 'landscape',
    description: 'Your relationship, lead, brand deal and collaborator sheets as tables',
    options: [
      { key: 'sheets', label: 'Sheets', type: 'text', default: '', hint: 'sheet names, comma separated — empty prints every sheet' },
      { key: 'pagePerSheet', label: 'New page per sheet', type: 'boolean', default: true },
      { key: 'longText', label: 'Long text columns (notes)', type: 'boolean', default: true },
    ],
    emptyReason: (s) => ((s.crm ?? []).some((x) => x.rows.length) ? false : 'Add a sheet with rows in People & Brands first'),
    render: (ctx) => {
      const { space, options } = ctx;
      const names = String(options.sheets ?? '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      const sheets = (space.crm ?? []).filter((x) => (names.length ? names.includes(x.name.toLowerCase()) : x.rows.length > 0));
      const today = new Date().toISOString().slice(0, 10);
      const cell = (c: CrmColumn, r: CrmRow) => {
        const v = r.values[c.id];
        if (c.type === 'select') {
          const o = optionOf(c, v);
          return o ? <PBadge color={o.color}>{o.label}</PBadge> : '';
        }
        if (c.type === 'money') return typeof v === 'number' ? ctx.fmt.money(v, { cents: false }) : '';
        if (c.type === 'date') return typeof v === 'string' && v ? <span className={/follow|next|due/i.test(c.name) && v <= today ? 'crm-due' : undefined}>{ctx.fmt.dateShort(v)}</span> : '';
        if (c.type === 'checkbox') return v ? '✓' : '';
        return <span style={{ wordBreak: c.type === 'url' || c.type === 'email' ? 'break-all' : undefined, whiteSpace: 'pre-wrap' }}>{displayValue(c, v, { campaigns: space.campaigns })}</span>;
      };
      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="People & Brands" subtitle={`${sheets.length} sheet${sheets.length === 1 ? '' : 's'} · ${sheets.reduce((n, x) => n + x.rows.length, 0)} rows`} />
            {sheets.length === 0 && <p className="pp-muted">No sheet matches “{String(options.sheets)}”.</p>}
            {sheets.map((sh, i) => {
              const cols = sh.columns.filter((c) => options.longText || c.type !== 'longtext');
              const due = dueRows(sh, today).length;
              const money = sh.columns.filter((c) => c.type === 'money');
              return (
                <div key={sh.id} className={`crm-sheet ${options.pagePerSheet && i > 0 ? 'pp-break-before' : ''}`}>
                  <PSection title={sh.name} right={`${sh.rows.length} rows${due ? ` · ${due} due` : ''}${money.map((c) => ` · ${c.name} ${ctx.fmt.money(sh.rows.reduce((n, r) => n + (typeof r.values[c.id] === 'number' ? (r.values[c.id] as number) : 0), 0), { cents: false })}`).join('')}`}>
                    {sh.description && <div className="crm-desc">{sh.description}</div>}
                    <PTable zebra rows={sh.rows} empty="No rows." columns={cols.map((c) => ({ header: c.name, width: c.type === 'longtext' ? '18%' : undefined, cell: (r: CrmRow) => cell(c, r) }))} />
                  </PSection>
                </div>
              );
            })}
          </>
        ),
      };
    },
  },
];

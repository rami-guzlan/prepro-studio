/* Imported statements: list, file viewer (PDF / CSV / OFX text), download, delete. */
import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText, FolderOpen, ListChecks, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { assetUrl, backend, getCurrentProjectId, saveBinaryFile } from '@/backend';
import { navigateSpace } from '@/store/app';
import { plural } from '@/lib/text';
import { toISODate } from '@/lib/dates';
import { Button, confirmDialog, EmptyState, IconButton, Menu, Modal, toast } from '@/ui';
import type { FinStatement } from '../../types';
import { STATEMENT_FORMATS } from '../../types';
import { accountLabel } from '../../calc';
import { deleteStatement } from '../../ops';
import { useAccountMap, useFinance, useFmt } from '../../ui';

/** Local calendar date of an ISO timestamp. */
const localDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso.slice(0, 10) : toISODate(d);
};

function formatBytes(n?: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export async function downloadStatement(s: FinStatement) {
  if (!s.file) return;
  try {
    const bytes = await backend.readAsset(getCurrentProjectId(), s.file);
    if (!bytes) {
      toast('The file is missing from the finances folder', 'error');
      return;
    }
    const ext = (s.fileName || s.file).split('.').pop()?.toLowerCase() ?? '';
    const path = await saveBinaryFile(s.fileName || `statement.${ext}`, bytes, ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined);
    if (path) toast(`Saved ${path.split(/[\\/]/).pop()}`);
  } catch (e) {
    toast(`Could not save: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

function TextFile({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => r.text())
      .then((t) => alive && setText(t.length > 200_000 ? `${t.slice(0, 200_000)}\n…` : t))
      .catch(() => alive && setText(''));
    return () => {
      alive = false;
    };
  }, [url]);
  return <pre className="fin-viewer-text">{text == null ? 'Loading…' : text || '(empty file)'}</pre>;
}

export function StatementViewer({ statement, onClose, onAddRows }: { statement: FinStatement; onClose: () => void; onAddRows?: (s: FinStatement) => void }) {
  const fmt = useFmt();
  const accts = useAccountMap();
  const url = statement.file ? assetUrl(statement.file) : '';
  const ext = (statement.fileName || statement.file || '').split('.').pop()?.toLowerCase() ?? '';
  return (
    <Modal
      open
      size="xl"
      title={statement.name || statement.fileName || 'Statement'}
      onClose={onClose}
      footer={
        <>
          <span className="muted small">
            {statement.accountId ? accountLabel(accts.get(statement.accountId)) : 'No account'} · {plural(statement.importedCount, 'transaction')} imported
          </span>
          <div className="spacer" />
          {statement.file && backend.assetPath && backend.openPath && (
            <Button icon={FolderOpen} onClick={async () => backend.openPath!(await backend.assetPath!(getCurrentProjectId(), statement.file!))}>
              Open in its app
            </Button>
          )}
          {statement.file && (
            <Button icon={Download} onClick={() => void downloadStatement(statement)}>
              Download
            </Button>
          )}
          {onAddRows && ext === 'pdf' && (
            <Button icon={Plus} onClick={() => onAddRows(statement)}>
              Add its transactions
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {!url ? (
        <EmptyState icon={FileText} title="No file kept for this statement" description={`It was imported ${statement.source === 'agent' ? 'by an AI agent' : 'from pasted rows'} on ${fmt.dateMedium(localDate(statement.importedAt))}.`} />
      ) : ext === 'pdf' ? (
        <iframe className="fin-pdf-frame" style={{ height: '65vh' }} src={url} title={statement.fileName || 'Statement PDF'} />
      ) : (
        <TextFile url={url} />
      )}
    </Modal>
  );
}

export function StatementsList({ onAddRows }: { onAddRows: (s: FinStatement) => void }) {
  const f = useFinance();
  const fmt = useFmt();
  const accts = useAccountMap();
  const [view, setView] = useState<string | null>(null);
  const list = useMemo(() => [...f.statements].sort((a, b) => (b.periodEnd ?? b.importedAt).localeCompare(a.periodEnd ?? a.importedAt)), [f.statements]);
  const viewing = view ? f.statements.find((s) => s.id === view) : undefined;
  const txCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of f.transactions) if (t.statementId) m.set(t.statementId, (m.get(t.statementId) ?? 0) + 1);
    return m;
  }, [f.transactions]);

  if (!list.length)
    return <EmptyState icon={FileText} title="No statements yet" description="Every import is recorded here with its file (PDF, CSV or OFX) so you can open or download it later." />;

  return (
    <>
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Statement</th>
              <th>Account</th>
              <th>Period</th>
              <th>Format</th>
              <th className="num">Transactions</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const n = txCount.get(s.id) ?? 0;
              return (
                <tr key={s.id}>
                  <td className="clickable" onClick={() => setView(s.id)}>
                    <div className="fin-desc">
                      <b>{s.name || s.fileName || 'Statement'}</b>
                      <span>{[s.fileName && s.name ? s.fileName : '', formatBytes(s.fileSize), s.file ? '' : 'no file kept', s.source === 'agent' ? 'via AI agent' : ''].filter(Boolean).join(' · ')}</span>
                    </div>
                  </td>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>
                    {s.accountId ? accountLabel(accts.get(s.accountId)) : <span className="muted">—</span>}
                  </td>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>
                    {s.periodStart ? `${fmt.dateMedium(s.periodStart)} – ${fmt.dateMedium(s.periodEnd)}` : '—'}
                  </td>
                  <td>
                    <span className="fin-badge">{STATEMENT_FORMATS.find((x) => x.value === s.format)?.label ?? s.format}</span>
                  </td>
                  <td className="num">
                    {n}
                    {s.duplicateCount ? <span className="muted small"> · {s.duplicateCount} dup.</span> : null}
                    {s.format === 'pdf' && n === 0 && (
                      <>
                        {' '}
                        <span className="fin-badge warning">needs rows</span>
                      </>
                    )}
                  </td>
                  <td className="small muted" style={{ whiteSpace: 'nowrap' }}>
                    {fmt.dateMedium(localDate(s.importedAt))}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {s.file && <IconButton icon={Eye} size="sm" label="View file" onClick={() => setView(s.id)} />}
                    {s.file && <IconButton icon={Download} size="sm" label="Download" onClick={() => void downloadStatement(s)} />}
                    <Menu
                      align="end"
                      trigger={<IconButton icon={MoreHorizontal} size="sm" label="More" />}
                      items={[
                        { label: 'Show its transactions', icon: ListChecks, disabled: !n, onClick: () => navigateSpace('transactions', { statementId: s.id }) },
                        ...(s.file && (s.fileName ?? s.file).toLowerCase().endsWith('.pdf') ? [{ label: 'Add transactions from this PDF', icon: Plus, onClick: () => onAddRows(s) }] : []),
                        { separator: true },
                        {
                          label: 'Delete the record (keep transactions)',
                          icon: Trash2,
                          onClick: async () => {
                            if (await confirmDialog({ title: 'Delete this statement record?', message: `${n ? `Its ${plural(n, 'transaction')} stay. ` : ''}The stored file is removed from the list.`, confirmLabel: 'Delete', danger: true })) deleteStatement(s.id, false);
                          },
                        },
                        {
                          label: `Delete with its ${plural(n, 'transaction')}`,
                          icon: Trash2,
                          danger: true,
                          disabled: !n,
                          onClick: async () => {
                            if (await confirmDialog({ title: `Delete the statement and ${plural(n, 'transaction')}?`, message: 'Use this to redo an import. Ctrl+Z undoes it.', confirmLabel: 'Delete all', danger: true })) deleteStatement(s.id, true);
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {viewing && (
        <StatementViewer
          statement={viewing}
          onClose={() => setView(null)}
          onAddRows={(s) => {
            setView(null);
            onAddRows(s);
          }}
        />
      )}
    </>
  );
}

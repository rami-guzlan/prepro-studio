/* Import statements: drop / choose CSV, OFX / QFX or PDF files (or paste text),
   map CSV columns (remembered per account), review new vs duplicate rows with
   automatic categories, then import into an account. The statement and its file
   are kept (Statements tab). PDFs: paste the transaction lines, or let a
   connected AI agent read the PDF and import it with finance_import_transactions. */
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { ArrowLeft, Bot, CheckCircle2, ClipboardPaste, FileSpreadsheet, FileText, FileUp, ListChecks, PiggyBank, Upload } from 'lucide-react';
import { assetUrl, backend } from '@/backend';
import { navigateSpace, useApp } from '@/store/app';
import { plural } from '@/lib/text';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { Button, Checkbox, Field, FormGrid, Input, ModuleHeader, NumberInput, Select, Tabs, Textarea, toast, Toolbar, UnderlineTabs } from '@/ui';
import type { AccountType, CsvMapping, FinStatement, StatementFormat } from '../../types';
import { ACCOUNT_TYPES } from '../../types';
import { monthLabel } from '../../calc';
import { bytesToText, closingBalance, csvHeaders, DATE_FORMATS, detectCsv, fileKind, parseOfx, parseStatementText, prepareImport, rowsFromCsv, rowsPeriod, SIGN_MODES, type DateFormat, type ParsedRow, type ReviewRow, type SignMode } from '../../importers';
import { addStatementFile, commitImport, updateFinance } from '../../ops';
import { AccountSelect, Amount, CategorySelect, FinCard, FinPage, PromptRow, AGENT_PROMPTS, useFinance, useFmt } from '../../ui';
import { StatementsList } from './Statements';

type Stage = 'pick' | 'csv' | 'pdf' | 'text' | 'review' | 'done';

interface Source {
  name: string;
  data?: Uint8Array;
  format: StatementFormat;
  /** existing statement (PDF stored earlier) */
  statementId?: string;
  url?: string;
}

export default function ImportModule() {
  const f = useFinance();
  const fmt = useFmt();
  const navKey = useApp((s) => s.navKey);
  const params = useApp((s) => s.params);
  const [tab, setTab] = useState<'import' | 'statements'>('import');
  const [stage, setStage] = useState<Stage>('pick');
  const [accountId, setAccountId] = useState<string | undefined>(() => f.settings.defaultAccountId ?? f.accounts.find((a) => !a.archived)?.id);
  const [src, setSrc] = useState<Source | null>(null);
  const [over, setOver] = useState(false);
  // csv
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  // text / pdf
  const [paste, setPaste] = useState('');
  const [signMode, setSignMode] = useState<SignMode | ''>('');
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');
  const [year, setYear] = useState<number | undefined>(undefined);
  // review
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [name, setName] = useState('');
  const [updateBalance, setUpdateBalance] = useState(true);
  const [ofxBalance, setOfxBalance] = useState<{ balance: number; date: string } | null>(null);
  const [result, setResult] = useState<{ statementId: string; imported: number; duplicates: number } | null>(null);
  const uncatImported = result ? f.transactions.filter((t) => t.statementId === result.statementId && !t.category && !t.transfer).length : 0;
  const [busy, setBusy] = useState(false);

  const account = f.accounts.find((a) => a.id === accountId);

  useEffect(() => {
    if (typeof params?.accountId === 'string') setAccountId(params.accountId);
    if (params?.tab === 'statements') setTab('statements');
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // blob URL for a PDF that is not stored yet
  useEffect(() => {
    return () => {
      if (src?.url?.startsWith('blob:')) URL.revokeObjectURL(src.url);
    };
  }, [src]);

  const reset = () => {
    setStage('pick');
    setSrc(null);
    setCsvRows([]);
    setMapping(null);
    setPaste('');
    setParsed([]);
    setReview([]);
    setSkipped(0);
    setSignMode('');
    setOfxBalance(null);
    setResult(null);
  };

  /* ---------------------------------------------------------------- reading files */

  const openFile = async (file: { name: string; data: Uint8Array }) => {
    const kind = fileKind(file.name);
    if (!kind) {
      toast('Use a CSV, OFX / QFX, PDF or TXT statement', 'error');
      return;
    }
    reset();
    if (kind === 'pdf') {
      setSrc({ name: file.name, data: file.data, format: 'pdf', url: URL.createObjectURL(new Blob([file.data as BlobPart], { type: 'application/pdf' })) });
      setStage('pdf');
      return;
    }
    const text = bytesToText(file.data);
    if (kind === 'csv') {
      const d = detectCsv(text, account?.type, account?.csvMapping);
      setSrc({ name: file.name, data: file.data, format: 'csv' });
      setCsvRows(d.rows);
      setMapping(d.mapping);
      setStage('csv');
      return;
    }
    if (kind === 'ofx') {
      const o = parseOfx(text);
      if (!o.rows.length) {
        toast('No transactions found in this OFX file', 'error');
        return;
      }
      setSrc({ name: file.name, data: file.data, format: 'ofx' });
      if (o.balance != null) setOfxBalance({ balance: o.balance, date: o.balanceDate ?? o.periodEnd ?? todayISO() });
      if (!accountId) {
        const match = f.accounts.find((a) => o.accountId && a.last4 && o.accountId.endsWith(a.last4));
        if (match) setAccountId(match.id);
      }
      toReview(o.rows, 0);
      return;
    }
    setSrc({ name: file.name, data: file.data, format: 'text' });
    setPaste(text);
    setStage('text');
  };

  const pick = async () => {
    try {
      const files = await backend.openFiles({ multiple: false, title: 'Choose a statement', filters: [{ name: 'Statements', extensions: ['csv', 'tsv', 'ofx', 'qfx', 'qbo', 'pdf', 'txt'] }] });
      if (files[0]) await openFile(files[0]);
    } catch (e) {
      toast(`Could not open the file: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await openFile({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
  };

  const addRowsFromStored = async (s: FinStatement) => {
    if (!s.file) return;
    reset();
    setTab('import');
    if (s.accountId) setAccountId(s.accountId);
    setSrc({ name: s.fileName || 'statement.pdf', format: 'pdf', statementId: s.id, url: assetUrl(s.file) });
    setStage('pdf');
  };

  /* ---------------------------------------------------------------- to review */

  const toReview = (rows: ParsedRow[], skippedRows: number) => {
    setParsed(rows);
    setSkipped(skippedRows);
    setStage('review');
  };

  useEffect(() => {
    if (stage !== 'review') return;
    setReview(prepareImport(parsed, accountId, f));
    const p = rowsPeriod(parsed);
    const acct = f.accounts.find((a) => a.id === accountId);
    setName(`${acct ? acct.name : 'Statement'}${p.to ? ` — ${monthLabel(p.to.slice(0, 7))}` : ''}`);
    // f is intentionally read once per (stage, rows, account)
  }, [stage, parsed, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const csvPreview = useMemo(() => (mapping && csvRows.length ? rowsFromCsv(csvRows, mapping) : { rows: [], skipped: 0 }), [csvRows, mapping]);
  const textPreview = useMemo(() => (paste.trim() ? parseStatementText(paste, { signMode: signMode || (account?.type === 'credit_card' ? 'charges' : undefined), dateFormat, year }) : null), [paste, signMode, dateFormat, year, account?.type]);

  const counts = useMemo(() => {
    const inc = review.filter((r) => r.include);
    return { total: review.length, include: inc.length, dup: review.filter((r) => r.duplicate).length, uncategorised: inc.filter((r) => !r.category).length, in: inc.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0), out: inc.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0) };
  }, [review]);
  const close = ofxBalance ?? closingBalance(review.filter((r) => r.include));

  const commit = async () => {
    if (!accountId) {
      toast('Choose the account first', 'error');
      return;
    }
    setBusy(true);
    try {
      const keepFile = src?.data && !src.statementId ? { name: src.name, data: src.data } : undefined;
      const r = await commitImport({
        accountId,
        rows: review,
        format: src?.format ?? 'text',
        file: keepFile,
        name: name.trim() || undefined,
        mapping: src?.format === 'csv' && mapping ? { ...mapping, headers: mapping.headerRow ? csvHeaders(csvRows, true) : undefined } : undefined,
        updateBalance: updateBalance && !!close,
        closingBalance: close?.balance,
        closingDate: close?.date,
        statementId: src?.statementId,
      });
      setResult(r);
      setStage('done');
      toast(`Imported ${plural(r.imported, 'transaction')}${r.duplicates ? ` · ${plural(r.duplicates, 'duplicate')} skipped` : ''}`);
    } catch (e) {
      toast(`Import failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const keepPdfOnly = async () => {
    if (!src?.data) return;
    await addStatementFile({ name: src.name, data: src.data }, accountId);
    toast('PDF kept in Statements — add its transactions later or ask your agent');
    reset();
    setTab('statements');
  };

  /* ---------------------------------------------------------------- render */

  const header = (
    <ModuleHeader
      title="Import statements"
      icon={FileUp}
      subtitle={f.statements.length ? `${plural(f.statements.length, 'statement')} imported · ${plural(f.transactions.length, 'transaction')}` : 'CSV, OFX / QFX and PDF statements from your banks and cards'}
      actions={
        stage !== 'pick' && tab === 'import' ? (
          <Button icon={ArrowLeft} onClick={reset}>
            Start over
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className="module">
      {header}
      <Toolbar>
        <div className="fin-tabscroll">
          <UnderlineTabs
            tabs={[
              { id: 'import', label: 'Import', icon: Upload },
              { id: 'statements', label: 'Statements', icon: FileText, count: f.statements.length },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </Toolbar>
      <div className="module-body">
        <FinPage narrow={stage !== 'pdf' && stage !== 'review'}>
          {tab === 'statements' ? (
            <StatementsList onAddRows={addRowsFromStored} />
          ) : (
            <>
              {stage !== 'done' && <AccountPicker accountId={accountId} onChange={setAccountId} />}

              {stage === 'pick' && (
                <>
                  <div
                    className={`fin-drop ${over ? 'over' : ''}`}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes('Files')) return;
                      e.preventDefault();
                      setOver(true);
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => void onDrop(e)}
                  >
                    <span className="fin-drop-icon">
                      <FileUp size={22} />
                    </span>
                    <h3>Drop a statement here</h3>
                    <p>Download it from your bank's or card's website (Statements / Download transactions). CSV and OFX/QFX import directly; PDFs are kept and you paste or let an agent read the transactions.</p>
                    <div className="fin-formats">
                      <span className="fin-badge">CSV / TSV</span>
                      <span className="fin-badge">OFX / QFX / QBO</span>
                      <span className="fin-badge">PDF</span>
                      <span className="fin-badge">Pasted text</span>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Button variant="primary" icon={Upload} onClick={() => void pick()}>
                        Choose file…
                      </Button>
                      <Button
                        icon={ClipboardPaste}
                        onClick={() => {
                          reset();
                          setSrc({ name: 'Pasted text', format: 'text' });
                          setStage('text');
                        }}
                      >
                        Paste transactions
                      </Button>
                    </div>
                  </div>
                  <FinCard
                    title={
                      <span className="row" style={{ gap: 6 }}>
                        <Bot size={15} /> Let your AI agent fetch them
                      </span>
                    }
                    sub="Agents with an email connector (Gmail, Outlook …) can find statement emails, download the attachments and import them here."
                  >
                    <PromptRow {...AGENT_PROMPTS[0]} />
                    <p className="fin-footnote">The agent calls finance_import_transactions with the file (CSV / PDF path or contents) or with the rows it read from a PDF. Duplicates are skipped, so importing the same month twice is safe. Works only while your finances are unlocked.</p>
                  </FinCard>
                </>
              )}

              {stage === 'csv' && mapping && (
                <CsvMappingCard
                  rows={csvRows}
                  mapping={mapping}
                  onChange={setMapping}
                  preview={csvPreview}
                  fileName={src?.name ?? ''}
                  remembered={!!account?.csvMapping && JSON.stringify(account.csvMapping.headers) === JSON.stringify(mapping.headers)}
                  onNext={() => toReview(csvPreview.rows, csvPreview.skipped)}
                />
              )}

              {(stage === 'pdf' || stage === 'text') && (
                <div className={stage === 'pdf' ? 'fin-pdf-split' : undefined}>
                  {stage === 'pdf' && src?.url && (
                    <FinCard title={src.name} sub="Select the transaction lines in the PDF and copy them (Ctrl+C)" flush>
                      <iframe className="fin-pdf-frame" style={{ border: 0, borderRadius: 0 }} src={src.url} title="Statement PDF" />
                    </FinCard>
                  )}
                  <div className="col" style={{ gap: 14, minWidth: 0 }}>
                    <FinCard title={stage === 'pdf' ? 'Paste the transaction lines' : 'Paste transactions'} sub="Each line needs a date and an amount, e.g. “10/03  BLUE BOTTLE COFFEE  4.50”">
                      <div className="col" style={{ gap: 10 }}>
                        <Textarea className="fin-paste" value={paste} onChange={setPaste} placeholder={'10/03  SQ *BLUE BOTTLE COFFEE      4.50\n10/04  PAYMENT - THANK YOU       -500.00\n10/05  AMZN Mktp US*2K4L19        23.99'} />
                        <FormGrid min={170}>
                          <Field label="Amounts">
                            <Select value={signMode || (account?.type === 'credit_card' ? 'charges' : textPreview?.signMode ?? 'signed')} options={SIGN_MODES} onChange={(v) => setSignMode(v as SignMode)} />
                          </Field>
                          <Field label="Dates">
                            <Select value={dateFormat} options={DATE_FORMATS} onChange={(v) => setDateFormat(v as DateFormat)} />
                          </Field>
                          <Field label="Year (if the lines have none)">
                            <NumberInput value={year} onChange={(v) => setYear(v ? Math.round(v) : undefined)} placeholder={String(new Date().getFullYear())} />
                          </Field>
                        </FormGrid>
                        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <span className="muted small">{textPreview ? `${plural(textPreview.rows.length, 'transaction')} found${textPreview.skipped ? ` · ${textPreview.skipped} lines skipped` : ''}` : 'Waiting for text'}</span>
                          <div className="spacer" />
                          {stage === 'pdf' && src?.data && (
                            <Button onClick={() => void keepPdfOnly()} title="Store the PDF now and add its transactions later (or let an agent do it)">
                              Keep PDF for later
                            </Button>
                          )}
                          <Button variant="primary" disabled={!textPreview?.rows.length} onClick={() => textPreview && toReview(textPreview.rows, textPreview.skipped)}>
                            Review {textPreview?.rows.length ? plural(textPreview.rows.length, 'row') : ''}
                          </Button>
                        </div>
                      </div>
                    </FinCard>
                    {stage === 'pdf' && (
                      <FinCard
                        title={
                          <span className="row" style={{ gap: 6 }}>
                            <Bot size={15} /> Or let your agent read it
                          </span>
                        }
                      >
                        <p className="fin-muted-note" style={{ marginTop: 0 }}>
                          PDF text isn't read inside the app. A connected AI agent can read the PDF (from your email or a file path), then call <b>finance_import_transactions</b> with the rows — try: “Import the transactions from my {account?.name ?? 'card'} PDF statement into PrePro Studio.”
                        </p>
                        {src?.data && (
                          <Button size="sm" onClick={() => void keepPdfOnly()}>
                            Keep the PDF in Statements
                          </Button>
                        )}
                      </FinCard>
                    )}
                  </div>
                </div>
              )}

              {stage === 'review' && (
                <FinCard
                  title="Review"
                  sub={`${src?.name ?? ''}${skipped ? ` · ${plural(skipped, 'line')} could not be read` : ''}`}
                  actions={
                    <Button variant="primary" disabled={!accountId || !counts.include || busy} onClick={() => void commit()}>
                      Import {plural(counts.include, 'transaction')}
                    </Button>
                  }
                >
                  <div className="col" style={{ gap: 12 }}>
                    <div className="fin-summary">
                      <span className="fin-badge good">{counts.total - counts.dup} new</span>
                      {counts.dup > 0 && <span className="fin-badge">{counts.dup} already imported</span>}
                      {counts.uncategorised > 0 && <span className="fin-badge warning">{counts.uncategorised} uncategorised</span>}
                      <span className="small muted">
                        in <Amount value={counts.in} /> · out <Amount value={counts.out} />
                      </span>
                      <div className="spacer" />
                      <Button size="sm" variant="ghost" onClick={() => setReview((rs) => rs.map((r) => ({ ...r, include: !r.duplicate })))}>
                        New only
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReview((rs) => rs.map((r) => ({ ...r, include: true })))}>
                        Include all
                      </Button>
                    </div>
                    <FormGrid min={220}>
                      <Field label="Statement name">
                        <Input value={name} onChange={setName} />
                      </Field>
                      {close && (
                        <Field label="Closing balance">
                          <Checkbox checked={updateBalance} onChange={setUpdateBalance} label={`Set ${account?.name ?? 'the account'} balance to ${fmt.money(Math.abs(close.balance))} (${fmt.dateMedium(close.date)})`} />
                        </Field>
                      )}
                    </FormGrid>
                    <div className="fin-table-wrap" style={{ maxHeight: '58vh' }}>
                      <table className="fin-table">
                        <thead>
                          <tr>
                            <th className="chk">
                              <Checkbox checked={review.length > 0 && review.every((r) => r.include)} onChange={(v) => setReview((rs) => rs.map((r) => ({ ...r, include: v })))} />
                            </th>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Category</th>
                            <th className="num">Amount</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {review.map((r) => (
                            <tr key={r.key} className={r.duplicate ? 'dup' : undefined}>
                              <td className="chk">
                                <Checkbox checked={r.include} onChange={(v) => setReview((rs) => rs.map((x) => (x.key === r.key ? { ...x, include: v } : x)))} />
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmt.date(r.date)}</td>
                              <td>
                                <div className="fin-desc">
                                  <b title={r.description}>{r.merchant || r.description}</b>
                                  {r.merchant && <span>{r.description}</span>}
                                </div>
                              </td>
                              <td>
                                <CategorySelect size="sm" bare value={r.category} onChange={(category) => setReview((rs) => rs.map((x) => (x.key === r.key ? { ...x, category, categorizedBy: undefined } : x)))} />
                              </td>
                              <td className="num">
                                <Amount value={r.amount} />
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>{r.duplicate ? <span className="fin-badge">Duplicate</span> : r.categorizedBy === 'rule' ? <span className="fin-badge accent">Rule</span> : r.categorizedBy === 'keyword' ? <span className="fin-badge">Auto</span> : null}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="fin-footnote" style={{ marginTop: 0 }}>
                      Duplicates (same account, date, amount and description as a transaction you already have) are unticked. Categories come from your rules first, then category keywords — fix any here or later in Transactions.
                    </p>
                  </div>
                </FinCard>
              )}

              {stage === 'done' && result && (
                <FinCard>
                  <div className="fin-success">
                    <span className="fin-success-icon">
                      <CheckCircle2 size={26} />
                    </span>
                    <h3 style={{ margin: 0 }}>Imported {plural(result.imported, 'transaction')}</h3>
                    <p className="muted" style={{ margin: 0 }}>
                      {result.duplicates ? `${plural(result.duplicates, 'duplicate')} skipped. ` : ''}The statement {src?.data ? 'and its file are' : 'is'} saved under Statements.
                    </p>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {uncatImported > 0 ? (
                        <Button variant="primary" icon={ListChecks} onClick={() => navigateSpace('transactions', { statementId: result.statementId, uncategorized: true })}>
                          Approve & categorise {uncatImported}
                        </Button>
                      ) : (
                        <Button variant="primary" icon={ListChecks} onClick={() => navigateSpace('transactions', { statementId: result.statementId })}>
                          Review transactions
                        </Button>
                      )}
                      {uncatImported > 0 && (
                        <Button icon={ListChecks} onClick={() => navigateSpace('transactions', { statementId: result.statementId })}>
                          All imported
                        </Button>
                      )}
                      <Button icon={PiggyBank} onClick={() => navigateSpace('budgets', {})}>
                        Assign the new money
                      </Button>
                      <Button icon={FileUp} onClick={reset}>
                        Import another
                      </Button>
                      <Button onClick={() => navigateSpace('overview')}>Overview</Button>
                    </div>
                  </div>
                </FinCard>
              )}
            </>
          )}
        </FinPage>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- account picker */

function AccountPicker({ accountId, onChange }: { accountId?: string; onChange: (id: string | undefined) => void }) {
  const f = useFinance();
  const [adding, setAdding] = useState(!f.accounts.length);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [last4, setLast4] = useState('');
  const [institution, setInstitution] = useState('');
  const add = () => {
    if (!name.trim()) return;
    const id = uid('acct');
    updateFinance((fd) => {
      fd.accounts.push({ id, name: name.trim(), type, last4: last4.replace(/\D/g, '').slice(-4) || undefined, institution: institution.trim() || undefined, slot: fd.accounts.length % 8 });
      if (!fd.settings.defaultAccountId) fd.settings.defaultAccountId = id;
    });
    onChange(id);
    setAdding(false);
    setName('');
    setLast4('');
    setInstitution('');
  };
  if (adding)
    return (
      <FinCard title={f.accounts.length ? 'New account' : 'Which account is this statement for?'} sub="Only a name and the last 4 digits — never the full card or account number.">
        <FormGrid min={150}>
          <Field label="Name">
            <Input autoFocus value={name} onChange={setName} placeholder="e.g. Chase Sapphire" onKeyDown={(e) => e.key === 'Enter' && add()} />
          </Field>
          <Field label="Type">
            <Select value={type} options={ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={(v) => setType(v as AccountType)} />
          </Field>
          <Field label="Bank / issuer">
            <Input value={institution} onChange={setInstitution} placeholder="optional" />
          </Field>
          <Field label="Last 4 digits">
            <Input value={last4} onChange={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))} placeholder="1234" inputMode="numeric" />
          </Field>
        </FormGrid>
        <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          {f.accounts.length > 0 && <Button onClick={() => setAdding(false)}>Cancel</Button>}
          <Button variant="primary" disabled={!name.trim()} onClick={add}>
            Add account
          </Button>
        </div>
      </FinCard>
    );
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="small" style={{ fontWeight: 600 }}>
        Import into
      </span>
      <div style={{ minWidth: 200, flex: '0 1 300px' }}>
        <AccountSelect value={accountId} onChange={onChange} placeholder="Choose an account…" />
      </div>
      <button type="button" className="fin-link" onClick={() => setAdding(true)}>
        + New account
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- CSV mapping */

function CsvMappingCard({ rows, mapping, onChange, preview, fileName, remembered, onNext }: { rows: string[][]; mapping: CsvMapping; onChange: (m: CsvMapping) => void; preview: { rows: ParsedRow[]; skipped: number }; fileName: string; remembered: boolean; onNext: () => void }) {
  const fmt = useFmt();
  const headers = csvHeaders(rows, mapping.headerRow);
  const opts = headers.map((h, i) => ({ value: String(i), label: h }));
  const set = (p: Partial<CsvMapping>) => onChange({ ...mapping, ...p });
  const idx = (v: string) => (v === '' ? undefined : Number(v));
  const split = mapping.amount == null;
  return (
    <FinCard
      title={
        <span className="row" style={{ gap: 6 }}>
          <FileSpreadsheet size={15} /> {fileName}
        </span>
      }
      sub={remembered ? 'Using the column mapping saved for this account' : 'Check the columns — the mapping is remembered for this account'}
      actions={
        <Button variant="primary" disabled={!preview.rows.length} onClick={onNext}>
          Review {plural(preview.rows.length, 'row')}
        </Button>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <div className="fin-map">
          <Field label="Date">
            <Select value={String(mapping.date)} options={opts} onChange={(v) => set({ date: Number(v) })} />
          </Field>
          <Field label="Description">
            <Select value={String(mapping.description)} options={opts} onChange={(v) => set({ description: Number(v) })} />
          </Field>
          <Field label="Amounts are in">
            <Tabs
              tabs={[
                { id: 'one', label: 'One column' },
                { id: 'two', label: 'Out / in' },
              ]}
              value={split ? 'two' : 'one'}
              onChange={(v) => (v === 'one' ? set({ amount: mapping.debit ?? mapping.credit ?? 0, debit: undefined, credit: undefined }) : set({ amount: undefined, debit: mapping.amount ?? 0, credit: mapping.amount ?? 0 }))}
            />
          </Field>
          {split ? (
            <>
              <Field label="Money out (debit)">
                <Select value={mapping.debit != null ? String(mapping.debit) : ''} placeholder="—" options={opts} onChange={(v) => set({ debit: idx(v) })} />
              </Field>
              <Field label="Money in (credit)">
                <Select value={mapping.credit != null ? String(mapping.credit) : ''} placeholder="—" options={opts} onChange={(v) => set({ credit: idx(v) })} />
              </Field>
            </>
          ) : (
            <Field label="Amount">
              <Select value={String(mapping.amount)} options={opts} onChange={(v) => set({ amount: Number(v) })} />
            </Field>
          )}
          <Field label="Balance (optional)">
            <Select value={mapping.balance != null ? String(mapping.balance) : ''} placeholder="None" options={opts} onChange={(v) => set({ balance: idx(v) })} />
          </Field>
          <Field label="Extra details (optional)">
            <Select value={mapping.extra?.[0] != null ? String(mapping.extra[0]) : ''} placeholder="None" options={opts} onChange={(v) => set({ extra: v === '' ? undefined : [Number(v)] })} />
          </Field>
          <Field label="Date format">
            <Select value={mapping.dateFormat} options={DATE_FORMATS} onChange={(v) => set({ dateFormat: v as DateFormat })} />
          </Field>
        </div>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <Checkbox checked={mapping.headerRow} onChange={(headerRow) => set({ headerRow })} label="First row is a header" />
          <Checkbox checked={mapping.invert} onChange={(invert) => set({ invert })} label="Flip signs (purchases are positive in this file)" />
        </div>
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Amount</th>
                {mapping.balance != null && <th className="num">Balance</th>}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 8).map((r, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt.date(r.date)}</td>
                  <td>
                    <div className="fin-desc">
                      <b>{r.description}</b>
                    </div>
                  </td>
                  <td className="num">
                    <Amount value={r.amount} />
                  </td>
                  {mapping.balance != null && <td className="num">{r.balance != null ? fmt.money(r.balance) : ''}</td>}
                </tr>
              ))}
              {!preview.rows.length && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                    No rows can be read with these columns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <span className="muted small">
          {plural(preview.rows.length, 'row')} read{preview.skipped ? ` · ${plural(preview.skipped, 'row')} skipped (no date or amount)` : ''} · money out shows as negative
        </span>
      </div>
    </FinCard>
  );
}

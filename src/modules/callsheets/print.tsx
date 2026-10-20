/* Printed call sheet: industry layout, tight 8pt type, boxes everywhere. */
import type { ReactNode } from 'react';
import type { PrintContext, PrintDocDef } from '@/print/types';
import { formatEighths, formatMinutes } from '@/lib/format';
import { plural } from '@/lib/text';
import { DOOD_STYLE, computeDays, dayNightLabel, intExtLabel, readableText } from '@/modules/schedule/logic';
import { CREW_SPECIAL, resolveCallSheet, type ResolvedCallSheet } from './logic';

function Box({ title, children, red, className }: { title: ReactNode; children: ReactNode; red?: boolean; className?: string }) {
  return (
    <div className={['ppc-box', red && 'red', className].filter(Boolean).join(' ')}>
      <div className="ppc-box-h">{title}</div>
      <div className="ppc-box-b">{children}</div>
    </div>
  );
}

function CallSheetPage({ ctx, r, first }: { ctx: PrintContext; r: ResolvedCallSheet; first: boolean }) {
  const { fmt, project: p, options: o } = ctx;
  const t = (v?: string) => (v ? (CREW_SPECIAL[v] ? v : fmt.time(v)) : '');
  const cs = r.cs;
  const logo = p.settings.print.showLogo && p.meta.logo ? ctx.asset(p.meta.logo) : '';
  const scenes = r.items.filter((x) => x.kind === 'scene');
  const deptNotes = r.deptNotes
    .map((n) => ({ key: n.key, text: n.text.trim() || (o.autoDeptNotes ? n.suggestion.trim() : '') }))
    .filter((n) => n.text);
  const safety = (cs.safetyNotes ?? '').trim();
  const special = (cs.specialInstructions ?? '').trim();
  const extras = r.extras.trim();
  const working = r.castRows.filter((c) => c.working).length;
  const nextScenes = r.nextItems.filter((x) => x.kind === 'scene');
  const parking = (cs.parking ?? r.parkingDefault ?? '').trim();

  return (
    <div className={['ppc', !first && 'pp-break-before'].filter(Boolean).join(' ')}>
      {/* ---------------- top band */}
      <div className="ppc-top">
        <div className="ppc-top-l">
          {logo && <img className="ppc-logo" src={logo} alt="" />}
          {p.meta.productionCompany && <div className="ppc-company">{p.meta.productionCompany}</div>}
          <div className="ppc-title">{p.meta.title}</div>
          {p.meta.subtitle && <div className="ppc-subtitle">{p.meta.subtitle}</div>}
          {r.keyContacts.length > 0 && (
            <table className="ppc-contacts">
              <tbody>
                {r.keyContacts.map((k, i) => (
                  <tr key={i}>
                    <td className="r">{k.role}</td>
                    <td>{k.name}</td>
                    <td className="p">{k.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="ppc-top-c">
          <div className="ppc-cs-label">CALL SHEET</div>
          <div className="ppc-gcc-label">GENERAL CREW CALL</div>
          <div className="ppc-gcc">{r.crewCall ? fmt.time(r.crewCall) : 'TBA'}</div>
          <div className="ppc-times">
            <div>
              <span>Shooting call</span>
              <b>{t(r.shootingCall) || '—'}</b>
            </div>
            <div>
              <span>Breakfast</span>
              <b>{t(r.breakfast) || '—'}</b>
            </div>
            <div>
              <span>Lunch</span>
              <b>{t(r.lunch) || '—'}</b>
            </div>
            <div>
              <span>Est. wrap</span>
              <b>{t(r.estWrap) || '—'}</b>
            </div>
          </div>
        </div>
        <div className="ppc-top-r">
          <div className="ppc-day">
            DAY {r.row.number} <span>OF {r.row.total}</span>
          </div>
          <div className="ppc-date">{r.row.date ? fmt.dateLong(r.row.date) : 'Date to be confirmed'}</div>
          {r.row.day.label && <div className="ppc-label">{r.row.day.label}</div>}
          <div className="ppc-version">
            Version {cs.version ?? 1} · {plural(scenes.length, 'scene')} · {formatEighths(r.row.eighths)} pgs
          </div>
          <div className="ppc-wx">
            <div className="ppc-wx-sum">{r.weather.summary || 'Weather: check forecast'}</div>
            <div className="ppc-wx-grid">
              <div>
                <span>High</span>
                <b>{r.weather.high || '—'}</b>
              </div>
              <div>
                <span>Low</span>
                <b>{r.weather.low || '—'}</b>
              </div>
              <div>
                <span>Precip</span>
                <b>{r.weather.precip || '—'}</b>
              </div>
              <div>
                <span>Sunrise</span>
                <b>{r.sun.sunrise ? fmt.time(r.sun.sunrise) : '—'}</b>
              </div>
              <div>
                <span>Sunset</span>
                <b>{r.sun.sunset ? fmt.time(r.sun.sunset) : '—'}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
      {cs.quote?.trim() && <div className="ppc-quote">“{cs.quote.trim()}”</div>}

      {/* ---------------- locations / hospital / parking */}
      <div className="ppc-row ppc-wrap">
        {r.locations.length === 0 && (
          <Box title="Location">
            <span className="ppc-muted">To be confirmed</span>
          </Box>
        )}
        {r.locations.map((l, i) => (
          <Box key={l.id} title={r.locations.length > 1 ? `Location ${i + 1}` : 'Location'}>
            <div className="ppc-locname">{l.name}</div>
            {l.address && <div>{l.address}</div>}
            {(l.contactName || l.contactPhone) && (
              <div className="ppc-kv">
                <b>Contact:</b> {[l.contactName, l.contactPhone].filter(Boolean).join(' · ')}
              </div>
            )}
            {l.power && (
              <div className="ppc-kv">
                <b>Power:</b> {l.power}
              </div>
            )}
            {l.loadIn && (
              <div className="ppc-kv">
                <b>Load-in:</b> {l.loadIn}
              </div>
            )}
          </Box>
        ))}
        <Box title="Nearest hospital" red>
          {r.hospital.name || r.hospital.address ? (
            <>
              <div className="ppc-locname">{r.hospital.name}</div>
              {r.hospital.address && <div>{r.hospital.address}</div>}
              {r.hospital.phone && <div className="ppc-kv">{r.hospital.phone}</div>}
            </>
          ) : (
            <span className="ppc-muted">To be confirmed</span>
          )}
        </Box>
        <Box title="Basecamp & parking">
          {cs.basecamp?.trim() && (
            <div>
              <b>Basecamp:</b> {cs.basecamp.trim()}
            </div>
          )}
          {parking ? (
            <div>
              <b>Parking:</b> {parking}
            </div>
          ) : null}
          {!cs.basecamp?.trim() && !parking && <span className="ppc-muted">See location</span>}
        </Box>
      </div>

      {special && (
        <div className="ppc-row">
          <Box title="Special instructions">{special}</Box>
        </div>
      )}

      {/* ---------------- scenes */}
      <table className="ppc-t">
        <colgroup>
          <col style={{ width: '6%' }} />
          <col />
          <col style={{ width: '11%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '21%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Sc</th>
            <th>Set & description</th>
            <th>Cast</th>
            <th>D/N</th>
            <th>Pgs</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((it) =>
            it.kind === 'banner' ? (
              <tr key={it.id} className="ban">
                <td colSpan={6} style={{ background: it.color || '#868e96', color: readableText(it.color || '#868e96') }}>
                  {it.text}
                </td>
              </tr>
            ) : (
              <tr key={it.id}>
                <td className="sc" style={{ background: it.bg, color: it.fg }}>
                  {it.scene.number}
                </td>
                <td>
                  <span className="set">
                    {intExtLabel(it.scene)} {it.scene.set}
                  </span>
                  {it.synopsis && <span className="syn"> — {it.synopsis}</span>}
                </td>
                <td>{it.cast.map((c) => c.label).join(', ')}</td>
                <td>{dayNightLabel(it.scene)}</td>
                <td className="n">{formatEighths(it.scene.eighths)}</td>
                <td>{it.location?.name ?? ''}</td>
              </tr>
            ),
          )}
          {scenes.length === 0 && (
            <tr>
              <td colSpan={6} className="ppc-muted">
                No scenes scheduled.
              </td>
            </tr>
          )}
          {scenes.length > 0 && (
            <tr className="tot">
              <td colSpan={4}>
                Total — {plural(scenes.length, 'scene')}
                {r.row.minutes ? ` · est. ${formatMinutes(r.row.minutes)}` : ''}
              </td>
              <td className="n">{formatEighths(r.row.eighths)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>

      {/* ---------------- cast */}
      <table className="ppc-t">
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Character</th>
            <th>Cast</th>
            <th>Status</th>
            <th>Pickup</th>
            <th>Call</th>
            <th>H/MU</th>
            <th>On set</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {r.castRows.map((c) => {
            const st = DOOD_STYLE[c.status];
            return (
              <tr key={c.cast.id} className={c.working ? undefined : 'held'}>
                <td className="c">
                  <b>{c.numbers}</b>
                </td>
                <td>
                  <b>{c.characters.map((x) => x.name).join(' / ')}</b>
                </td>
                <td>{c.cast.name}</td>
                <td className="c">
                  {c.status && (
                    <span className="ppc-code" style={st ? { background: st.bg, color: st.fg } : undefined}>
                      {c.status}
                    </span>
                  )}
                </td>
                <td className="tm">{t(c.pickup)}</td>
                <td className="tm">{c.working ? t(c.call) : ''}</td>
                <td className="tm">{c.working ? t(c.hmu) : ''}</td>
                <td className="tm">{c.working ? t(c.onSet) : ''}</td>
                <td>{c.notes || (c.working ? '' : 'Hold')}</td>
              </tr>
            );
          })}
          {r.uncast.map((ch) => (
            <tr key={ch.id}>
              <td className="c">
                <b>{ch.number ?? ''}</b>
              </td>
              <td>
                <b>{ch.name}</b>
              </td>
              <td className="ppc-muted">TBD</td>
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
          {r.castRows.length === 0 && r.uncast.length === 0 && (
            <tr>
              <td colSpan={9} className="ppc-muted">
                No cast called.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ---------------- extras / safety */}
      <div className="ppc-row">
        <Box title="Background / extras">{extras || <span className="ppc-muted">None</span>}</Box>
        <Box title="Safety" red>
          {safety || <span className="ppc-muted">Safety first — report all hazards and injuries to the 1st AD immediately.</span>}
        </Box>
      </div>

      {/* ---------------- department notes */}
      {deptNotes.length > 0 && (
        <>
          <div className="ppc-sec-h">Department notes</div>
          <div className="ppc-depts">
            {deptNotes.map((n) => (
              <Box key={n.key} title={n.key}>
                {n.text}
              </Box>
            ))}
          </div>
        </>
      )}

      {/* ---------------- crew */}
      {r.crewGroups.length > 0 && (
        <>
          <div className="ppc-sec-h">
            Crew calls <span>· {working} cast · {plural(r.crewGroups.reduce((n, g) => n + g.rows.filter((x) => x.call !== 'N/C').length, 0), 'crew member')} called</span>
          </div>
          <div className="ppc-crew">
            {r.crewGroups.map((g) => (
              <div key={g.dept} className="ppc-cg">
                <table className="ppc-ct">
                  <thead>
                    <tr>
                      <th colSpan={o.crewPhones ? 3 : 2}>{g.dept}</th>
                      <th className="cnt">Call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((c) => (
                      <tr key={c.crew.id}>
                        <td className="pos">{c.crew.position}</td>
                        <td className="nm">
                          {c.crew.name}
                          {c.notes ? <span className="ppc-note"> — {c.notes}</span> : null}
                        </td>
                        {o.crewPhones && <td className="ph">{c.crew.phone}</td>}
                        <td className="tm">{t(c.call) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------------- advance / walkies / notes */}
      <div className="ppc-row">
        {o.showAdvance && (
          <Box title={r.next ? `Advance schedule — Day ${r.next.number}${r.next.date ? ` · ${fmt.dateMedium(r.next.date)}` : ''}` : 'Advance schedule'} className="ppc-grow2">
            {r.next ? (
              nextScenes.length ? (
                <table className="ppc-adv">
                  <tbody>
                    {r.nextItems.map((it) =>
                      it.kind === 'scene' ? (
                        <tr key={it.id}>
                          <td style={{ width: '8%' }}>
                            <b>{it.scene.number}</b>
                          </td>
                          <td>
                            <b>
                              {intExtLabel(it.scene)} {it.scene.set}
                            </b>
                            {it.location ? <span className="ppc-muted"> — {it.location.name}</span> : null}
                          </td>
                          <td style={{ width: '10%' }}>{dayNightLabel(it.scene)}</td>
                          <td style={{ width: '14%' }}>{it.cast.map((c) => c.label).join(', ')}</td>
                          <td style={{ width: '9%', textAlign: 'right' }}>{formatEighths(it.scene.eighths)}</td>
                        </tr>
                      ) : null,
                    )}
                  </tbody>
                </table>
              ) : (
                <span className="ppc-muted">Scenes to be scheduled.</span>
              )
            ) : (
              <span className="ppc-muted">Last day of principal photography.</span>
            )}
            {cs.advanceNotes?.trim() && <div style={{ marginTop: '2pt' }}>{cs.advanceNotes.trim()}</div>}
          </Box>
        )}
        <Box title="Walkie channels">{cs.walkieChannels?.trim() || <span className="ppc-muted">Ch 1 — Production</span>}</Box>
      </div>
      {cs.generalNotes?.trim() && (
        <div className="ppc-row">
          <Box title="General notes">{cs.generalNotes.trim()}</Box>
        </div>
      )}
      <div className="ppc-fine">
        All call times are subject to change. No visitors on set without prior approval of the producers. No forced calls without prior approval of the
        production manager. Report every accident or injury to the 1st AD immediately — safety first.
      </div>
    </div>
  );
}

const CSS = `
.ppc { font-size: 7.8pt; line-height: 1.28; color: #111; }
.ppc-muted { color: #777; }
.ppc-top { display: grid; grid-template-columns: 1.25fr 1fr 1.25fr; border: 1.4pt solid #111; break-inside: avoid; page-break-inside: avoid; }
.ppc-top > div { padding: 5pt 7pt; min-width: 0; }
.ppc-top-c { border-left: 1.4pt solid #111; border-right: 1.4pt solid #111; text-align: center; padding: 0 !important; display: flex; flex-direction: column; }
.ppc-logo { max-height: 26pt; max-width: 110pt; object-fit: contain; display: block; margin-bottom: 3pt; }
.ppc-company { font-size: 6.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
.ppc-title { font-size: 14pt; font-weight: 800; line-height: 1.1; letter-spacing: -0.01em; }
.ppc-subtitle { font-size: 7.6pt; color: #444; }
.ppc-contacts { margin-top: 4pt; width: 100%; border-collapse: collapse; font-size: 7.1pt; }
.ppc-contacts td { padding: 0.7pt 0; vertical-align: top; border-top: 0.4pt solid #ddd; }
.ppc-contacts td.r { color: #555; font-weight: 700; text-transform: uppercase; font-size: 5.8pt; letter-spacing: 0.04em; width: 36%; padding-top: 1.3pt; }
.ppc-contacts td.p { text-align: right; white-space: nowrap; }
.ppc-cs-label { background: #111; color: #fff; font-size: 7pt; font-weight: 800; letter-spacing: 0.32em; padding: 2pt 0; }
.ppc-gcc-label { font-size: 6.4pt; font-weight: 800; letter-spacing: 0.14em; margin-top: 5pt; }
.ppc-gcc { font-size: 26pt; font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; padding-bottom: 4pt; white-space: nowrap; }
.ppc-times { display: grid; grid-template-columns: 1fr 1fr; border-top: 1pt solid #111; margin-top: auto; }
.ppc-times > div { padding: 2.2pt 4pt; border-bottom: 0.5pt solid #bbb; }
.ppc-times > div:nth-child(odd) { border-right: 0.5pt solid #bbb; }
.ppc-times > div:nth-last-child(-n+2) { border-bottom: 0; }
.ppc-times span { display: block; font-size: 5.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #555; }
.ppc-times b { font-size: 9pt; white-space: nowrap; }
.ppc-top-r { text-align: right; }
.ppc-day { font-size: 16pt; font-weight: 800; line-height: 1; }
.ppc-day span { font-size: 9pt; font-weight: 700; color: #555; }
.ppc-date { font-size: 8.6pt; font-weight: 700; margin-top: 2pt; }
.ppc-label { font-size: 7.4pt; color: #444; }
.ppc-version { font-size: 6.2pt; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1pt; }
.ppc-wx { margin-top: 4pt; border: 0.8pt solid #111; text-align: left; }
.ppc-wx-sum { background: #ececf0; font-weight: 700; padding: 1.5pt 4pt; border-bottom: 0.8pt solid #111; font-size: 7.4pt; }
.ppc-wx-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
.ppc-wx-grid > div { padding: 1.5pt 2pt; border-right: 0.5pt solid #bbb; text-align: center; min-width: 0; }
.ppc-wx-grid > div:last-child { border-right: 0; }
.ppc-wx-grid span { display: block; font-size: 5.4pt; font-weight: 700; text-transform: uppercase; color: #555; letter-spacing: 0.04em; }
.ppc-wx-grid b { font-size: 7.6pt; white-space: nowrap; }
.ppc-quote { text-align: center; font-style: italic; font-size: 7.4pt; padding: 2.5pt 8pt; border: 1.4pt solid #111; border-top: 0; color: #333; }
.ppc-row { display: flex; gap: 4pt; margin-top: 4pt; align-items: stretch; }
.ppc-row.ppc-wrap { flex-wrap: wrap; }
.ppc-row.ppc-wrap > .ppc-box { flex: 1 1 22%; }
.ppc-row > .ppc-box { flex: 1 1 0; min-width: 0; }
.ppc-row > .ppc-box.ppc-grow2 { flex: 2 1 0; }
.ppc-box { border: 0.8pt solid #111; break-inside: avoid; page-break-inside: avoid; }
.ppc-box-h { background: #e4e4e9; border-bottom: 0.8pt solid #111; font-size: 6.2pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; padding: 1.3pt 4pt; }
.ppc-box-b { padding: 2.5pt 4pt; white-space: pre-wrap; word-break: break-word; }
.ppc-box.red { border-color: #c92a2a; }
.ppc-box.red .ppc-box-h { background: #c92a2a; color: #fff; border-color: #c92a2a; }
.ppc-locname { font-weight: 800; font-size: 7.9pt; }
.ppc-kv { font-size: 7.1pt; }
.ppc-t { width: 100%; border-collapse: collapse; margin-top: 4pt; font-size: 7.5pt; }
.ppc-t thead { display: table-header-group; }
.ppc-t th { background: #111; color: #fff; font-size: 6pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; padding: 1.8pt 3pt; text-align: left; border: 0.5pt solid #111; }
.ppc-t td { border: 0.5pt solid #9a9aa3; padding: 1.8pt 3pt; vertical-align: top; }
.ppc-t tr { break-inside: avoid; page-break-inside: avoid; }
.ppc-t td.c { text-align: center; }
.ppc-t td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ppc-t td.sc { font-weight: 800; font-size: 8.6pt; text-align: center; }
.ppc-t td.tm { font-weight: 700; white-space: nowrap; text-align: center; font-variant-numeric: tabular-nums; }
.ppc-t tr.ban td { font-weight: 800; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; font-size: 6.8pt; }
.ppc-t tr.tot td { font-weight: 800; background: #ececf0; }
.ppc-t tr.held td { color: #666; }
.ppc-t .set { font-weight: 800; text-transform: uppercase; }
.ppc-t .syn { color: #333; }
.ppc-code { display: inline-block; min-width: 17pt; padding: 0 2pt; border-radius: 1.5pt; font-weight: 800; font-size: 6.6pt; border: 0.5pt solid #888; }
.ppc-sec-h { margin-top: 5pt; background: #111; color: #fff; font-size: 6.4pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 1.8pt 4pt; break-after: avoid; page-break-after: avoid; }
.ppc-sec-h span { font-weight: 500; letter-spacing: 0.02em; text-transform: none; opacity: 0.85; }
.ppc-depts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4pt; margin-top: 4pt; }
.ppc-crew { column-count: 2; column-gap: 6pt; margin-top: 4pt; }
.ppc-cg { break-inside: avoid; page-break-inside: avoid; display: inline-block; width: 100%; margin-bottom: 3pt; }
.ppc-ct { width: 100%; border-collapse: collapse; font-size: 7pt; border: 0.6pt solid #111; }
.ppc-ct th { background: #e4e4e9; color: #111; text-align: left; font-size: 6.2pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; padding: 1.3pt 3pt; border-bottom: 0.6pt solid #111; }
.ppc-ct th.cnt { text-align: right; }
.ppc-ct td { border-bottom: 0.4pt solid #c9c9d1; padding: 1.2pt 3pt; vertical-align: top; }
.ppc-ct tr:last-child td { border-bottom: 0; }
.ppc-ct td.pos { color: #333; width: 38%; }
.ppc-ct td.nm { font-weight: 700; }
.ppc-ct td.ph { white-space: nowrap; color: #333; width: 23%; }
.ppc-ct td.tm { text-align: right; font-weight: 800; white-space: nowrap; width: 14%; }
.ppc-note { font-weight: 400; color: #555; }
.ppc-adv { width: 100%; border-collapse: collapse; font-size: 7.1pt; }
.ppc-adv td { padding: 0.8pt 2pt; border-bottom: 0.4pt solid #ddd; vertical-align: top; }
.ppc-fine { margin-top: 5pt; font-size: 6pt; color: #555; text-align: center; border-top: 0.5pt solid #bbb; padding-top: 2.5pt; }
`;

function pickDays(ctx: PrintContext, count: number, days: { id: string }[]): number[] {
  if (ctx.options.allDays) return days.map((_, i) => i);
  const want = String(ctx.options.dayId ?? '').trim();
  if (!want) return count ? [0] : [];
  let idx = days.findIndex((d) => d.id === want);
  if (idx < 0 && /^\d+$/.test(want)) idx = Number(want) - 1;
  return [idx >= 0 && idx < count ? idx : 0];
}

export const printDocs: PrintDocDef[] = [
  {
    id: 'call-sheet',
    title: 'Call Sheet',
    group: 'Schedule',
    orientation: 'portrait',
    description: 'Daily call sheet: crew call, weather, locations, scenes, cast, crew and department notes',
    options: [
      { key: 'dayId', label: 'Shoot day', type: 'text', default: '', hint: 'Day number or id — empty = first shoot day' },
      { key: 'allDays', label: 'All shoot days (one call sheet per day)', type: 'boolean', default: false },
      { key: 'autoDeptNotes', label: 'Fill empty department notes from the breakdown', type: 'boolean', default: true },
      { key: 'crewPhones', label: 'Crew phone numbers', type: 'boolean', default: true },
      { key: 'showAdvance', label: 'Advance schedule (next day)', type: 'boolean', default: true },
    ],
    emptyReason: (p) => (p.schedule?.days?.length ? false : 'No shoot days yet — add days in the Shooting Schedule.'),
    render: (ctx) => {
      const p = ctx.project;
      const rows = computeDays(p, ctx.model);
      const picked = pickDays(ctx, rows.length, p.schedule.days);
      const sheets = picked.map((i) => resolveCallSheet(p, ctx.model, i, { rows, time: ctx.fmt.time })).filter((x): x is ResolvedCallSheet => !!x);
      const one = sheets.length === 1 ? sheets[0] : undefined;
      const title = one ? `Call Sheet — Day ${one.row.number}` : 'Call Sheets';
      return {
        title,
        fileName: `${p.meta.title || 'Project'} - ${one ? `Call Sheet Day ${one.row.number}${one.row.date ? ` (${one.row.date})` : ''}` : 'Call Sheets'}`,
        margins: { top: 0.38, right: 0.38, bottom: 0.45, left: 0.38 },
        header: false,
        footer: {
          left: `${p.meta.title}${one ? ` · Call sheet Day ${one.row.number} of ${one.row.total}${one.row.date ? ` · ${ctx.fmt.dateMedium(one.row.date)}` : ''} · v${one.cs.version ?? 1}` : ' · Call sheets'}`,
          center: p.settings.print.confidential ? 'CONFIDENTIAL' : '',
        },
        body: sheets.length ? (
          <>
            {sheets.map((r, i) => (
              <CallSheetPage key={r.row.day.id} ctx={ctx} r={r} first={i === 0} />
            ))}
          </>
        ) : (
          <div className="ppc-muted">No shoot days yet.</div>
        ),
        css: CSS,
      };
    },
  },
];

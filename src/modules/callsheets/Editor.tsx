/* Call sheet editor for one shoot day. Every value shown here is also what prints. */
import { useMemo, useState, type ReactNode } from 'react';
import {
  CalendarRange,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudSun,
  Copy,
  Ellipsis,
  ExternalLink,
  Hospital as HospitalIcon,
  MapPin,
  Minus,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Sunrise,
  Sunset,
  Users,
  HardHat,
  StickyNote,
  Radio,
  Contact,
  Film,
} from 'lucide-react';
import type { ID } from '@/types';
import { useFormatters, useProjectData } from '@/store/project';
import { navigate, openPrint } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { formatEighths, formatMinutes } from '@/lib/format';
import { plural } from '@/lib/text';
import { Badge, Button, Combo, Field, IconButton, Input, Menu, MultiSelect, Popover, Switch, Textarea, TimeInput, type AnchorRect } from '@/ui';
import { DOOD_STYLE, dayNightLabel, intExtLabel, pagesLabel, readableText } from '@/modules/schedule/logic';
import { CREW_SPECIAL, STANDARD_WALKIES, resolveCallSheet, type CrewRow } from './logic';
import {
  clearField,
  copyFromPrevious,
  fillDeptNotes,
  resetCallSheet,
  setCastCall,
  setCrewCall,
  setCrewCalls,
  setDeptNote,
  setField,
  setHospital,
  setLocations,
  setVersion,
  setWeather,
} from './actions';

const WEATHER_SUGGESTIONS = ['Clear', 'Sunny', 'Mostly sunny', 'Partly cloudy', 'Overcast', 'Light rain', 'Rain', 'Showers', 'Thunderstorms', 'Fog', 'Windy', 'Snow', 'Clear, light wind'];

/* ---------------------------------------------------------------- small pieces */

function Section({ title, icon: Icon, actions, children, className }: { title: ReactNode; icon?: typeof Clock; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={['callsh-card', className].filter(Boolean).join(' ')}>
      <header className="callsh-card-head">
        {Icon && <Icon />}
        <h3>{title}</h3>
        <div className="spacer" />
        {actions}
      </header>
      <div className="callsh-card-body">{children}</div>
    </section>
  );
}

/** Time input that shows a computed default (italic) until a value is entered. */
function AutoTime({ value, isDefault, onChange, ariaLabel }: { value?: string; isDefault?: boolean; onChange: (v: string | undefined) => void; ariaLabel?: string }) {
  const auto = isDefault && !!value;
  return (
    <span className={`callsh-time ${auto ? 'auto' : ''}`} title={auto ? 'Default — change it to override, clear it to go back to the default' : undefined} aria-label={ariaLabel}>
      <TimeInput size="sm" value={value} onChange={onChange} />
    </span>
  );
}

function StatusCode({ code }: { code: string }) {
  if (!code) return null;
  const st = DOOD_STYLE[code];
  return (
    <span className="callsh-code" style={st ? { background: st.bg, color: st.fg } : undefined} title={st?.label}>
      {code}
    </span>
  );
}

/* ---------------------------------------------------------------- crew row */

function CrewCallCell({ dayId, row, generalCall }: { dayId: ID; row: CrewRow; generalCall?: string }) {
  const fmt = useFormatters();
  const special = row.call && CREW_SPECIAL[row.call];
  const items = [
    { label: 'Not called (N/C)', onClick: () => setCrewCall(dayId, row.crew.id, 'call', 'N/C') },
    { label: 'On call (O/C)', onClick: () => setCrewCall(dayId, row.crew.id, 'call', 'O/C') },
    {
      label: row.defaultCall ? `Use default (${CREW_SPECIAL[row.defaultCall] ? row.defaultCall : fmt.time(row.defaultCall)})` : 'Use default',
      disabled: row.isDefault,
      onClick: () => setCrewCall(dayId, row.crew.id, 'call', undefined),
    },
  ];
  return (
    <div className="row" style={{ gap: 2 }}>
      {special ? (
        <button
          type="button"
          className={`callsh-special ${row.isDefault ? 'auto' : ''}`}
          title={`${special}${row.isDefault ? ' (default for this department)' : ''} — click to set a time`}
          onClick={() => setCrewCall(dayId, row.crew.id, 'call', (row.defaultCall && !CREW_SPECIAL[row.defaultCall] ? row.defaultCall : generalCall) ?? '07:00')}
        >
          {row.call}
        </button>
      ) : (
        <AutoTime value={row.call} isDefault={row.isDefault} onChange={(v) => setCrewCall(dayId, row.crew.id, 'call', v)} ariaLabel={`Call for ${row.crew.name}`} />
      )}
      <Menu align="end" trigger={<IconButton size="sm" icon={Ellipsis} label="Call options" />} items={items} />
    </div>
  );
}

function DeptCallButton({ dayId, ids, dept }: { dayId: ID; ids: ID[]; dept: string }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [value, setValue] = useState<string | undefined>();
  const apply = () => {
    if (!value) return;
    setCrewCalls(dayId, ids, value);
    setAnchor(null);
  };
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={Clock}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      >
        Set department call
      </Button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} align="end">
        <div className="callsh-pop" onKeyDown={(e) => e.key === 'Enter' && apply()}>
          <div className="section-title">{dept} — call for everyone</div>
          <TimeInput value={value} onChange={setValue} />
          <div className="row">
            <Button size="sm" variant="primary" disabled={!value} onClick={apply}>
              Apply to {plural(ids.length, 'person', 'people')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCrewCalls(dayId, ids, undefined);
                setAnchor(null);
              }}
            >
              Use defaults
            </Button>
          </div>
        </div>
      </Popover>
    </>
  );
}

/* ---------------------------------------------------------------- editor */

export function CallSheetEditor({ dayIndex }: { dayIndex: number }) {
  const p = useProjectData();
  const model = useScriptModel();
  const fmt = useFormatters();
  const r = useMemo(() => resolveCallSheet(p, model, dayIndex, { time: fmt.time }), [p, model, dayIndex, fmt]);
  const [sunOverride, setSunOverride] = useState(false);
  if (!r) return null;
  const { row, cs } = r;
  const dayId = row.day.id;
  const ready = r.missing.length === 0;

  return (
    <div className="callsh-editor">
      {/* ---------------- hero */}
      <div className="callsh-hero">
        <div className="callsh-hero-main">
          <div className="callsh-eyebrow">
            Call sheet · Day {row.number} of {row.total}
            {row.day.label ? ` · ${row.day.label}` : ''}
          </div>
          <h2>{row.date ? fmt.dateLong(row.date) : 'Date not set'}</h2>
          <div className="callsh-hero-meta">
            <span>
              <Film /> {plural(row.scenes.length, 'scene')}
            </span>
            <span>{pagesLabel(row.eighths)}</span>
            {row.minutes > 0 && (
              <span>
                <Clock /> est. {formatMinutes(row.minutes)}
              </span>
            )}
            <span>
              <Users /> {plural(r.castRows.filter((c) => c.working).length, 'actor')}
            </span>
            <span className="callsh-version">
              Version
              <IconButton size="sm" icon={Minus} label="Previous version" disabled={(cs.version ?? 1) <= 1} onClick={() => setVersion(dayId, (cs.version ?? 1) - 1)} />
              <strong>{cs.version ?? 1}</strong>
              <IconButton size="sm" icon={Plus} label="Next version" onClick={() => setVersion(dayId, (cs.version ?? 1) + 1)} />
            </span>
          </div>
        </div>
        <div className="callsh-hero-actions">
          <Button size="sm" icon={Copy} disabled={dayIndex === 0} onClick={() => copyFromPrevious(dayIndex)} title={dayIndex === 0 ? 'This is the first shoot day' : `Copy call times from Day ${dayIndex}`}>
            Copy times from previous day
          </Button>
          <Button size="sm" icon={RotateCcw} disabled={!r.exists} onClick={() => resetCallSheet(dayId, row.number)}>
            Reset to defaults
          </Button>
          <Button size="sm" icon={CalendarRange} onClick={() => navigate('schedule', { dayId })}>
            Schedule
          </Button>
          <Button size="sm" variant="primary" icon={Printer} onClick={() => openPrint('call-sheet', { dayId })}>
            Print
          </Button>
        </div>
      </div>
      <div className={`callsh-ready ${ready ? 'ok' : 'warn'}`}>
        {ready ? <CircleCheck /> : <CircleAlert />}
        {ready ? <span>Ready to send — everything a call sheet needs is filled in.</span> : <span>Still missing: {r.missing.join(' · ')}</span>}
      </div>

      <div className="callsh-grid">
        {/* ---------------- times */}
        <Section title="Call times" icon={Clock}>
          <div className="callsh-times">
            <label className="callsh-crewcall">
              <span>General crew call</span>
              <TimeInput value={cs.crewCall} onChange={(v) => setField(dayId, 'crewCall', v)} />
            </label>
            <Field label="Shooting call">
              <TimeInput size="sm" value={cs.shootingCall} onChange={(v) => setField(dayId, 'shootingCall', v)} />
            </Field>
            <Field label="Breakfast">
              <TimeInput size="sm" value={cs.breakfast} onChange={(v) => setField(dayId, 'breakfast', v)} />
            </Field>
            <Field label="Lunch">
              <TimeInput size="sm" value={cs.lunch} onChange={(v) => setField(dayId, 'lunch', v)} />
            </Field>
            <Field label="Est. wrap">
              <TimeInput size="sm" value={cs.estWrap} onChange={(v) => setField(dayId, 'estWrap', v)} />
            </Field>
          </div>
        </Section>

        {/* ---------------- weather */}
        <Section title="Weather & daylight" icon={CloudSun}>
          <div className="callsh-weather">
            <Field label="Forecast" span={2}>
              <Combo size="sm" value={cs.weather?.summary} onChange={(v) => setWeather(dayId, 'summary', v)} suggestions={WEATHER_SUGGESTIONS} placeholder="e.g. Clear, light wind" />
            </Field>
            <Field label="High">
              <Input size="sm" value={cs.weather?.high} onChange={(v) => setWeather(dayId, 'high', v)} placeholder="52°F" />
            </Field>
            <Field label="Low">
              <Input size="sm" value={cs.weather?.low} onChange={(v) => setWeather(dayId, 'low', v)} placeholder="41°F" />
            </Field>
            <Field label="Precip.">
              <Input size="sm" value={cs.weather?.precip} onChange={(v) => setWeather(dayId, 'precip', v)} placeholder="10%" />
            </Field>
          </div>
          <div className="callsh-sun">
            <div className="callsh-sun-val">
              <Sunrise />
              <div>
                <div className="callsh-sun-label">Sunrise</div>
                <div className="callsh-sun-time">{r.sun.sunrise ? fmt.time(r.sun.sunrise) : '—'}</div>
              </div>
            </div>
            <div className="callsh-sun-val">
              <Sunset />
              <div>
                <div className="callsh-sun-label">Sunset</div>
                <div className="callsh-sun-time">{r.sun.sunset ? fmt.time(r.sun.sunset) : '—'}</div>
              </div>
            </div>
            <div className="callsh-sun-src">
              {r.sun.source && row.date ? (
                <>
                  Computed for <strong>{r.sun.source.name}</strong>
                  {r.sun.goldenEvening ? ` · golden hour from ${fmt.time(r.sun.goldenEvening)}` : ''}
                  {r.sun.dusk ? ` · civil dusk ${fmt.time(r.sun.dusk)}` : ''}
                  {r.sun.overridden && <Badge tone="warning">overridden</Badge>}
                </>
              ) : !row.date ? (
                <>Set a date for this shoot day to compute sunrise and sunset.</>
              ) : (
                <>
                  Add coordinates (latitude / longitude) to this day’s location in{' '}
                  <button type="button" className="callsh-link" onClick={() => navigate('locations')}>
                    Locations
                  </button>{' '}
                  to compute sunrise and sunset automatically.
                </>
              )}
            </div>
          </div>
          <Switch checked={sunOverride || r.sun.overridden || !r.sun.computedSunrise} onChange={setSunOverride} label="Enter sunrise / sunset manually" disabled={r.sun.overridden || !r.sun.computedSunrise} />
          {(sunOverride || r.sun.overridden || !r.sun.computedSunrise) && (
            <div className="row" style={{ gap: 10, marginTop: 8 }}>
              <Field label="Sunrise">
                <TimeInput size="sm" value={cs.weather?.sunrise} onChange={(v) => setWeather(dayId, 'sunrise', v)} />
              </Field>
              <Field label="Sunset">
                <TimeInput size="sm" value={cs.weather?.sunset} onChange={(v) => setWeather(dayId, 'sunset', v)} />
              </Field>
              {r.sun.overridden && r.sun.computedSunrise && (
                <Button
                  size="sm"
                  variant="ghost"
                  style={{ alignSelf: 'flex-end' }}
                  onClick={() => {
                    setWeather(dayId, 'sunrise', undefined);
                    setWeather(dayId, 'sunset', undefined);
                    setSunOverride(false);
                  }}
                >
                  Use computed times
                </Button>
              )}
            </div>
          )}
        </Section>

        {/* ---------------- locations */}
        <Section
          title="Locations"
          icon={MapPin}
          className="wide"
          actions={
            r.locationsOverridden ? (
              <Button size="sm" variant="ghost" onClick={() => setLocations(dayId, undefined)}>
                Use scheduled locations
              </Button>
            ) : null
          }
        >
          {r.locations.length === 0 && (
            <div className="callsh-empty-line">
              No location is linked to the scenes of this day. Link sets to locations in{' '}
              <button type="button" className="callsh-link" onClick={() => navigate('locations')}>
                Locations
              </button>{' '}
              or choose locations below.
            </div>
          )}
          <div className="callsh-locs">
            {r.locations.map((l, i) => (
              <div key={l.id} className="callsh-loc">
                <div className="callsh-loc-head">
                  <span className="callsh-loc-num">{i + 1}</span>
                  <strong className="grow">{l.name}</strong>
                  <IconButton size="sm" icon={ExternalLink} label="Open in Locations" onClick={() => navigate('locations', { locationId: l.id })} />
                </div>
                {l.address && <div>{l.address}</div>}
                {(l.contactName || l.contactPhone) && (
                  <div className="muted">
                    <Phone size={12} /> {[l.contactName, l.contactPhone].filter(Boolean).join(' · ')}
                  </div>
                )}
                {l.parking && (
                  <div className="small">
                    <b>Parking:</b> {l.parking}
                  </div>
                )}
                {l.power && (
                  <div className="small">
                    <b>Power:</b> {l.power}
                  </div>
                )}
                {l.lat == null && <div className="tiny muted">No coordinates</div>}
              </div>
            ))}
          </div>
          <Field label="Locations on this call sheet" hint={r.locationsOverridden ? 'Chosen manually' : 'From the scheduled scenes — add or remove to override'}>
            <MultiSelect
              size="sm"
              value={r.locations.map((l) => l.id)}
              onChange={(ids) => setLocations(dayId, ids)}
              options={p.locations.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Add location…"
            />
          </Field>
          <div className="callsh-two">
            <Field label="Basecamp">
              <Textarea autoGrow minRows={2} value={cs.basecamp} onChange={(v) => setField(dayId, 'basecamp', v)} placeholder="Holding, catering, trucks — where the crew reports" />
            </Field>
            <Field label="Crew parking">
              <Textarea autoGrow minRows={2} value={cs.parking} onChange={(v) => setField(dayId, 'parking', v)} placeholder={r.parkingDefault ?? 'Where to park'} />
            </Field>
          </div>
          <div className="callsh-hospital">
            <div className="callsh-hospital-title">
              <HospitalIcon /> Nearest hospital
              {r.hospitalSource && !cs.hospital && <span className="muted tiny">from {r.hospitalSource.name}</span>}
            </div>
            <div className="callsh-three">
              <Input size="sm" value={cs.hospital?.name} onChange={(v) => setHospital(dayId, 'name', v)} placeholder={r.hospitalDefault.name ?? 'Hospital name'} aria-label="Hospital name" />
              <Input size="sm" value={cs.hospital?.address} onChange={(v) => setHospital(dayId, 'address', v)} placeholder={r.hospitalDefault.address ?? 'Address'} aria-label="Hospital address" />
              <Input size="sm" type="tel" value={cs.hospital?.phone} onChange={(v) => setHospital(dayId, 'phone', v)} placeholder={r.hospitalDefault.phone ?? 'Phone'} aria-label="Hospital phone" />
            </div>
          </div>
        </Section>

        {/* ---------------- scenes */}
        <Section
          title="Scenes"
          icon={Film}
          className="wide"
          actions={
            <Button size="sm" variant="ghost" icon={CalendarRange} onClick={() => navigate('schedule', { dayId })}>
              Edit in schedule
            </Button>
          }
        >
          {r.items.length === 0 ? (
            <div className="callsh-empty-line">No scenes are scheduled on this day yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="table callsh-scenes">
                <thead>
                  <tr>
                    <th style={{ width: 54 }}>Sc</th>
                    <th>Set & synopsis</th>
                    <th style={{ width: 120 }}>Cast</th>
                    <th style={{ width: 70 }}>D/N</th>
                    <th className="num" style={{ width: 60 }}>
                      Pages
                    </th>
                    <th style={{ width: 200 }}>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((it) =>
                    it.kind === 'banner' ? (
                      <tr key={it.id}>
                        <td colSpan={6} className="callsh-banner" style={{ background: it.color || '#868e96', color: readableText(it.color || '#868e96') }}>
                          {it.text}
                        </td>
                      </tr>
                    ) : (
                      <tr key={it.id}>
                        <td>
                          <span className="callsh-scnum" style={{ background: it.bg, color: it.fg }}>
                            {it.scene.number}
                          </span>
                        </td>
                        <td>
                          <div className="strong">
                            {intExtLabel(it.scene)} {it.scene.set}
                          </div>
                          {it.synopsis && <div className="muted small">{it.synopsis}</div>}
                        </td>
                        <td>{it.cast.map((c) => c.label).join(', ')}</td>
                        <td>{dayNightLabel(it.scene)}</td>
                        <td className="num">{formatEighths(it.scene.eighths)}</td>
                        <td className="small">{it.location?.name ?? <span className="muted">—</span>}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ---------------- cast */}
        <Section title="Cast" icon={Users} className="wide" actions={<span className="muted tiny">Italic times are defaults (H/MU = crew call, call = crew call + 30 min)</span>}>
          {r.uncast.length > 0 && (
            <div className="callsh-warnline">
              <CircleAlert /> No actor cast for {r.uncast.map((c) => `${c.number != null ? `${c.number}. ` : ''}${c.name}`).join(', ')} —{' '}
              <button type="button" className="callsh-link" onClick={() => navigate('cast')}>
                assign in Cast
              </button>
            </div>
          )}
          {r.castRows.length === 0 ? (
            <div className="callsh-empty-line">No cast members work on this day.</div>
          ) : (
            <div className="table-wrap">
              <table className="table callsh-cast">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Character</th>
                    <th>Actor</th>
                    <th style={{ width: 62 }}>Status</th>
                    <th style={{ width: 118 }}>Pickup</th>
                    <th style={{ width: 118 }}>Call</th>
                    <th style={{ width: 118 }}>H/MU</th>
                    <th style={{ width: 118 }}>On set</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {r.castRows.map((c) => (
                    <tr key={c.cast.id} className={c.working ? undefined : 'callsh-held'}>
                      <td className="strong">{c.numbers}</td>
                      <td className="strong">{c.characters.map((x) => x.name).join(' / ')}</td>
                      <td>
                        <div>{c.cast.name}</div>
                        {c.cast.phone && <div className="tiny muted">{c.cast.phone}</div>}
                      </td>
                      <td>
                        <StatusCode code={c.status} />
                      </td>
                      <td>
                        <AutoTime value={c.pickup} onChange={(v) => setCastCall(dayId, c.cast.id, 'pickup', v)} ariaLabel="Pickup" />
                      </td>
                      <td>
                        <AutoTime value={c.call} isDefault={c.callDefault} onChange={(v) => setCastCall(dayId, c.cast.id, 'call', v)} ariaLabel="Call" />
                      </td>
                      <td>
                        <AutoTime value={c.hmu} isDefault={c.hmuDefault} onChange={(v) => setCastCall(dayId, c.cast.id, 'hmu', v)} ariaLabel="Hair & makeup" />
                      </td>
                      <td>
                        <AutoTime value={c.onSet} onChange={(v) => setCastCall(dayId, c.cast.id, 'onSet', v)} ariaLabel="On set" />
                      </td>
                      <td>
                        <Input bare size="sm" value={c.notes} onChange={(v) => setCastCall(dayId, c.cast.id, 'notes', v)} placeholder={c.working ? 'Notes' : 'Hold — not working today'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ---------------- extras & safety */}
        <Section
          title="Background & extras"
          icon={Users}
          actions={
            !r.extrasIsDefault ? (
              <Button size="sm" variant="ghost" onClick={() => clearField(dayId, 'extras')} title="Use the extras from the scene breakdowns">
                Use breakdown
              </Button>
            ) : null
          }
        >
          <Textarea
            autoGrow
            minRows={3}
            value={r.extras}
            onChange={(v) => setField(dayId, 'extras', v)}
            placeholder="No background in today’s scenes. Add counts, call times and wardrobe notes for extras here."
          />
          {r.extrasIsDefault && r.extrasDefault && <div className="tiny muted" style={{ marginTop: 4 }}>From the scene breakdowns — edit to override.</div>}
        </Section>

        <Section
          title="Safety"
          icon={ShieldAlert}
          actions={
            r.safetySuggestion && !(cs.safetyNotes ?? '').includes(r.safetySuggestion) ? (
              <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => setField(dayId, 'safetyNotes', [cs.safetyNotes, r.safetySuggestion].filter(Boolean).join('\n'))}>
                Insert from breakdown
              </Button>
            ) : null
          }
        >
          <Textarea autoGrow minRows={3} value={cs.safetyNotes} onChange={(v) => setField(dayId, 'safetyNotes', v)} placeholder={r.safetySuggestion || 'Safety notes — hazards, PPE, stunts, special effects, weather…'} />
        </Section>

        {/* ---------------- crew */}
        <Section title="Crew calls" icon={HardHat} className="wide" actions={<span className="muted tiny">Default = the person’s default call, otherwise the general crew call</span>}>
          {r.crewGroups.length === 0 ? (
            <div className="callsh-empty-line">
              No crew yet —{' '}
              <button type="button" className="callsh-link" onClick={() => navigate('crew')}>
                add crew
              </button>
              .
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table callsh-crew">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Position</th>
                    <th style={{ width: 140 }}>Phone</th>
                    <th style={{ width: 160 }}>Call</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {r.crewGroups.map((g) => (
                    <FragmentGroup key={g.dept} dept={g.dept} count={g.rows.length} dayId={dayId} ids={g.rows.map((x) => x.crew.id)}>
                      {g.rows.map((c) => (
                        <tr key={c.crew.id}>
                          <td className="strong">{c.crew.name}</td>
                          <td>{c.crew.position}</td>
                          <td className="small">{c.crew.phone}</td>
                          <td>
                            <CrewCallCell dayId={dayId} row={c} generalCall={cs.crewCall} />
                          </td>
                          <td>
                            <Input bare size="sm" value={c.notes} onChange={(v) => setCrewCall(dayId, c.crew.id, 'notes', v)} placeholder="Notes" />
                          </td>
                        </tr>
                      ))}
                    </FragmentGroup>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ---------------- department notes */}
        <Section
          title="Department notes"
          icon={StickyNote}
          className="wide"
          actions={
            <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => fillDeptNotes(dayId, r.deptNotes)}>
              Fill empty notes from breakdown
            </Button>
          }
        >
          <div className="callsh-depts">
            {r.deptNotes.map((n) => {
              const canInsert = !!n.suggestion && !n.text.includes(n.suggestion);
              return (
                <div key={n.key} className="callsh-dept">
                  <div className="callsh-dept-head">
                    <span>{n.key}</span>
                    {canInsert && (
                      <button
                        type="button"
                        className="callsh-link small"
                        title={n.suggestion}
                        onClick={() => setDeptNote(dayId, n.key, n.text.trim() ? `${n.text.trim()}\n${n.suggestion}` : n.suggestion)}
                      >
                        <Sparkles size={12} /> Insert suggestion
                      </button>
                    )}
                  </div>
                  <Textarea autoGrow minRows={2} value={n.text} onChange={(v) => setDeptNote(dayId, n.key, v)} placeholder={n.suggestion || `Notes for ${n.key}`} />
                </div>
              );
            })}
          </div>
        </Section>

        {/* ---------------- contacts & walkies */}
        <Section
          title="Key contacts"
          icon={Contact}
          actions={
            <Button size="sm" variant="ghost" onClick={() => navigate('crew')}>
              Edit crew
            </Button>
          }
        >
          {r.keyContacts.length === 0 ? (
            <div className="callsh-empty-line">Add a Producer, Director, 1st AD or Production Manager in Crew to list them here.</div>
          ) : (
            <div className="callsh-contacts">
              {r.keyContacts.map((k, i) => (
                <div key={i} className="callsh-contact">
                  <span className="muted small">{k.role}</span>
                  <strong>{k.name}</strong>
                  <span className="small">{k.phone || <span className="muted">no phone</span>}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Walkie channels"
          icon={Radio}
          actions={
            !cs.walkieChannels ? (
              <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => setField(dayId, 'walkieChannels', STANDARD_WALKIES)}>
                Insert standard channels
              </Button>
            ) : null
          }
        >
          <Textarea autoGrow minRows={3} value={cs.walkieChannels} onChange={(v) => setField(dayId, 'walkieChannels', v)} placeholder={'Ch 1 — Production\nCh 2 — Open\nCh 3 — Camera'} />
        </Section>

        {/* ---------------- advance */}
        <Section title="Advance schedule" icon={CalendarRange}>
          {r.next ? (
            <>
              <div className="strong" style={{ marginBottom: 6 }}>
                Day {r.next.number} — {r.next.date ? fmt.dateLong(r.next.date) : 'date not set'}
                {r.next.day.label ? <span className="muted"> · {r.next.day.label}</span> : null}
              </div>
              {r.nextItems.filter((x) => x.kind === 'scene').length === 0 ? (
                <div className="callsh-empty-line">No scenes scheduled yet.</div>
              ) : (
                <div className="callsh-adv">
                  {r.nextItems.map((it) =>
                    it.kind === 'scene' ? (
                      <div key={it.id} className="callsh-adv-row">
                        <span className="callsh-scnum" style={{ background: it.bg, color: it.fg }}>
                          {it.scene.number}
                        </span>
                        <span className="grow ellipsis">
                          {intExtLabel(it.scene)} {it.scene.set} — {dayNightLabel(it.scene)}
                        </span>
                        <span className="muted small nowrap">{formatEighths(it.scene.eighths)} pg</span>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="callsh-empty-line">This is the last shoot day.</div>
          )}
          <Field label="Advance notes" style={{ marginTop: 10 }}>
            <Textarea autoGrow minRows={2} value={cs.advanceNotes} onChange={(v) => setField(dayId, 'advanceNotes', v)} placeholder="Heads-up for tomorrow (early call, different location…)" />
          </Field>
        </Section>

        {/* ---------------- notes */}
        <Section title="Notes" icon={StickyNote}>
          <Field label="Special instructions">
            <Textarea autoGrow minRows={2} value={cs.specialInstructions} onChange={(v) => setField(dayId, 'specialInstructions', v)} placeholder="Closed set, visitors, press, client on set…" />
          </Field>
          <Field label="General notes" style={{ marginTop: 10 }}>
            <Textarea autoGrow minRows={2} value={cs.generalNotes} onChange={(v) => setField(dayId, 'generalNotes', v)} />
          </Field>
          <Field label="Quote of the day" style={{ marginTop: 10 }}>
            <Input value={cs.quote} onChange={(v) => setField(dayId, 'quote', v)} placeholder="A line to start the day" />
          </Field>
        </Section>
      </div>
    </div>
  );
}

function FragmentGroup({ dept, count, dayId, ids, children }: { dept: string; count: number; dayId: ID; ids: ID[]; children: ReactNode }) {
  return (
    <>
      <tr className="group-row">
        <td colSpan={5}>
          <div className="row">
            <span>{dept}</span>
            <span className="muted tiny">{count}</span>
            <div className="spacer" />
            <DeptCallButton dayId={dayId} ids={ids} dept={dept} />
          </div>
        </td>
      </tr>
      {children}
    </>
  );
}


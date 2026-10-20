/* Detail view of one location: photos, address & coordinates, sun, contact, logistics, hospital, sets & scenes, notes. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClipboardCheck, Copy, ExternalLink, Hospital, MapPin, MoreHorizontal, Plus, Printer, Trash2, X } from 'lucide-react';
import type { Hospital as HospitalT, ID, Location } from '@/types';
import { listOps, useFormatters, useProject } from '@/store/project';
import { navigate, openPrint } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { sceneDayIndex } from '@/derived/project';
import { LOCATION_STATUSES, STRIP_COLORS } from '@/lib/constants';
import { plural } from '@/lib/text';
import { Button, Combo, Field, IconButton, Input, Menu, NumberInput, Select, Switch, Textarea } from '@/ui';
import { assignSet, deleteLocation, duplicateLocation, removeSet } from './actions';
import { formatCoords, hasCoords, LOCATION_KINDS, mapsSearchUrl, parseCoords, PERMIT_STATUSES, scenesAt, setRows, shootDaysAt } from './data';
import { PhotoGallery } from './PhotoGallery';
import { SunCard } from './SunCard';
import { currencySymbol, LinkInput, openExternal } from './util';

const ops = listOps<Location>((d) => d.locations, 'locations');

export function LocationDetail({ loc, autoFocusName, onSelect }: { loc: Location; autoFocusName?: boolean; onSelect: (id: ID | 'sets' | null) => void }) {
  const locations = useProject((p) => p.locations);
  const schedule = useProject((p) => p.schedule);
  const callSheets = useProject((p) => p.callSheets);
  const currency = useProject((p) => p.settings.currency);
  const model = useScriptModel();
  const fmt = useFormatters();
  const set = (patch: Partial<Location>) => ops.update(loc.id, patch);
  const setHospital = (patch: Partial<HospitalT>) => set({ hospital: { ...(loc.hospital ?? {}), ...patch } });

  const scenes = useMemo(() => scenesAt(locations, model, loc.id), [locations, model, loc.id]);
  const days = useMemo(() => shootDaysAt(schedule, callSheets, locations, model, loc.id), [schedule, callSheets, locations, model, loc.id]);
  const dayIdx = useMemo(() => sceneDayIndex({ schedule }), [schedule]);
  const rows = useMemo(() => setRows(model, locations), [model, locations]);
  const sceneCountBySet = useMemo(() => new Map(rows.map((r) => [r.id, r.scenes.length])), [rows]);
  const eighths = scenes.reduce((a, s) => a + (s.eighths || 0), 0);

  return (
    <div className="loc-detail">
      <div className="loc-detail-head">
        <Input
          key={loc.id}
          className="loc-name"
          value={loc.name}
          placeholder="Location name"
          autoFocus={autoFocusName}
          onChange={(name) => set({ name })}
        />
        <Select value={loc.status} options={LOCATION_STATUSES} onChange={(v) => set({ status: v as Location['status'] })} style={{ width: 130 }} />
        <Select value={loc.kind ?? ''} placeholder="Type…" options={LOCATION_KINDS} onChange={(v) => set({ kind: (v || undefined) as Location['kind'] })} style={{ width: 170 }} />
        <Button icon={Printer} onClick={() => openPrint('location-sheets', { only: loc.id })}>
          Location sheet
        </Button>
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="More actions" />}
          items={[
            { label: 'Print tech scout checklist', icon: ClipboardCheck, onClick: () => openPrint('tech-scout', { only: loc.id }) },
            { label: 'Duplicate', icon: Copy, onClick: () => onSelect(duplicateLocation(loc.id) ?? loc.id) },
            { separator: true },
            { label: 'Delete location', icon: Trash2, danger: true, onClick: () => deleteLocation(loc.id).then((ok) => ok && onSelect(null)) },
          ]}
        />
      </div>

      <div className="loc-detail-body">
        <Card title="Photos" sub={loc.photos?.length ? `${loc.photos.length} · first photo is the cover` : undefined} full>
          <PhotoGallery photos={loc.photos ?? []} name={loc.name} onChange={(photos) => ops.update(loc.id, { photos }, false)} />
        </Card>

        <div className="loc-cards">
          <Card title="Address & map">
            <Field label="Address">
              <Textarea autoGrow minRows={2} value={loc.address} placeholder="Street, city, postcode" onChange={(address) => set({ address })} />
            </Field>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <Button size="sm" icon={MapPin} disabled={!loc.address?.trim() && !hasCoords(loc)} onClick={() => openExternal(mapsSearchUrl(loc.address?.trim() || formatCoords(loc.lat, loc.lng)))}>
                Open in Maps
              </Button>
            </div>
            <Field
              label="Coordinates (latitude, longitude)"
              hint="Right-click a spot in Google Maps and click the numbers to copy them, then paste here. Used for sunrise/sunset on call sheets."
              style={{ marginTop: 12 }}
            >
              <div className="row" style={{ gap: 6 }}>
                <CoordsInput lat={loc.lat} lng={loc.lng} onChange={(lat, lng) => set({ lat, lng })} />
                <IconButton
                  icon={ExternalLink}
                  label="Show coordinates in Maps"
                  size="sm"
                  disabled={!hasCoords(loc)}
                  onClick={() => openExternal(mapsSearchUrl(formatCoords(loc.lat, loc.lng)))}
                />
              </div>
            </Field>
          </Card>

          <Card title="Sun">
            <SunCard loc={loc} days={days} />
          </Card>

          <Card title="Location contact">
            <div className="loc-grid2">
              <Field label="Name" span="all">
                <Input value={loc.contactName} placeholder="Owner, manager or rep" onChange={(contactName) => set({ contactName })} />
              </Field>
              <Field label="Phone">
                <LinkInput kind="tel" value={loc.contactPhone} onChange={(contactPhone) => set({ contactPhone })} />
              </Field>
              <Field label="Email">
                <LinkInput kind="email" value={loc.contactEmail} onChange={(contactEmail) => set({ contactEmail })} />
              </Field>
              <Field label="Availability" span="all">
                <Textarea autoGrow minRows={1} value={loc.availability} placeholder="Access hours, available dates, blackout dates" onChange={(availability) => set({ availability })} />
              </Field>
            </div>
          </Card>

          <Card title="Fee & permits">
            <div className="loc-grid2">
              <Field label="Location fee">
                <NumberInput value={loc.fee} decimals={2} prefix={currencySymbol(currency)} onChange={(fee) => set({ fee })} />
              </Field>
              <Field label="Permit status">
                <Select
                  value={loc.permitStatus ?? ''}
                  placeholder="—"
                  options={PERMIT_STATUSES}
                  onChange={(v) => set({ permitStatus: (v || undefined) as Location['permitStatus'], ...(v && v !== 'n/a' ? { permitRequired: true } : v === 'n/a' ? { permitRequired: false } : {}) })}
                />
              </Field>
              <div className="span-all">
                <Switch
                  checked={loc.permitRequired}
                  onChange={(permitRequired) => set({ permitRequired, ...(permitRequired && (!loc.permitStatus || loc.permitStatus === 'n/a') ? { permitStatus: 'needed' as const } : {}), ...(!permitRequired ? { permitStatus: 'n/a' as const } : {}) })}
                  label="Filming permit required"
                />
              </div>
            </div>
          </Card>

          <Card title="Logistics" full>
            <div className="loc-grid2 wide">
              <Field label="Parking">
                <Textarea autoGrow minRows={2} value={loc.parking} placeholder="Crew parking, truck parking, permits" onChange={(parking) => set({ parking })} />
              </Field>
              <Field label="Power">
                <Textarea autoGrow minRows={2} value={loc.power} placeholder="Circuits, amperage, generator placement" onChange={(power) => set({ power })} />
              </Field>
              <Field label="Restrooms">
                <Textarea autoGrow minRows={1} value={loc.restrooms} placeholder="Where, how many" onChange={(restrooms) => set({ restrooms })} />
              </Field>
              <Field label="Load-in">
                <Textarea autoGrow minRows={1} value={loc.loadIn} placeholder="Elevator, stairs, distance from trucks" onChange={(loadIn) => set({ loadIn })} />
              </Field>
              <Field label="Wi-Fi">
                <Input value={loc.wifi} placeholder="Network / password" onChange={(wifi) => set({ wifi })} />
              </Field>
            </div>
          </Card>

          <Card title="Nearest hospital" icon={<Hospital size={14} className="loc-hosp-icon" />}>
            <div className="loc-grid2">
              <Field label="Name" span="all">
                <Input value={loc.hospital?.name} placeholder="Emergency room" onChange={(name) => setHospital({ name })} />
              </Field>
              <Field label="Address" span="all">
                <div className="row" style={{ gap: 4 }}>
                  <Input value={loc.hospital?.address} onChange={(address) => setHospital({ address })} />
                  <IconButton icon={MapPin} label="Route in Maps" size="sm" disabled={!loc.hospital?.address?.trim()} onClick={() => openExternal(mapsSearchUrl(loc.hospital!.address!))} />
                </div>
              </Field>
              <Field label="Phone">
                <LinkInput kind="tel" value={loc.hospital?.phone} onChange={(phone) => setHospital({ phone })} />
              </Field>
            </div>
          </Card>

          <Card title="Sets & scenes" sub={scenes.length ? `${plural(scenes.length, 'scene')} · ${fmt.eighths(eighths)} pages` : undefined}>
            <SetChips loc={loc} sceneCountBySet={sceneCountBySet} scriptSets={rows} />
            {days.length > 0 && (
              <div className="loc-days">
                Shooting{' '}
                {days.map((d, i) => (
                  <span key={d.index}>
                    {i > 0 && ', '}
                    <strong>{d.label}</strong>
                    {d.date && ` (${fmt.dateShort(d.date)})`}
                  </span>
                ))}
              </div>
            )}
            {scenes.length === 0 ? (
              <div className="muted small" style={{ marginTop: 10 }}>
                No scenes are shot here yet. Assign the script's sets above to link scenes to this location.
              </div>
            ) : (
              <div className="loc-scenes">
                {scenes.map((s) => {
                  const strip = STRIP_COLORS[s.stripKey] ?? STRIP_COLORS.OTHER;
                  const di = dayIdx.get(s.id);
                  return (
                    <button key={s.id} type="button" className="loc-scene" onClick={() => navigate('script', { sceneId: s.id })} title="Open in script">
                      <span className="loc-scene-num" style={{ background: strip.bg, color: strip.fg }}>
                        {s.number}
                      </span>
                      <span className="grow ellipsis">{s.heading || 'Untitled scene'}</span>
                      {s.meta?.locationId === loc.id && <span className="tiny muted">override</span>}
                      {di != null && <span className="tiny muted">Day {di + 1}</span>}
                      <span className="tiny muted num">{fmt.eighths(s.eighths)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Tech scout notes">
            <Textarea autoGrow minRows={4} value={loc.scoutNotes} placeholder="Sound issues, sun direction, holding areas, hazards…" onChange={(scoutNotes) => set({ scoutNotes })} />
          </Card>

          <Card title="Notes">
            <Textarea autoGrow minRows={4} value={loc.notes} placeholder="Anything else the crew needs to know on the day" onChange={(notes) => set({ notes })} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, sub, icon, full, children }: { title: string; sub?: string; icon?: ReactNode; full?: boolean; children: ReactNode }) {
  return (
    <section className={`card loc-card ${full ? 'full' : ''}`}>
      <div className="loc-card-head">
        {icon}
        <h3>{title}</h3>
        {sub && <span className="muted tiny">{sub}</span>}
      </div>
      <div className="loc-card-body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ coordinates */

function CoordsInput({ lat, lng, onChange }: { lat?: number; lng?: number; onChange: (lat: number | undefined, lng: number | undefined) => void }) {
  const display = formatCoords(lat, lng);
  const [text, setText] = useState(display);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);
  const commit = () => {
    const t = text.trim();
    if (!t) {
      if (lat != null || lng != null) onChange(undefined, undefined);
      setError(false);
      return;
    }
    const c = parseCoords(t);
    if (c) {
      if (c.lat !== lat || c.lng !== lng) onChange(c.lat, c.lng);
      setError(false);
      setText(formatCoords(c.lat, c.lng));
    } else setError(true);
  };
  return (
    <div className="grow" style={{ minWidth: 0 }}>
      <Input
        value={text}
        placeholder="40.71280, -73.95730"
        className={error ? 'loc-invalid' : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        onChange={(v) => {
          setText(v);
          setError(false);
          const c = parseCoords(v);
          if (c && (c.lat !== lat || c.lng !== lng)) onChange(c.lat, c.lng);
        }}
      />
      {error && <div className="loc-error">Couldn't read these coordinates. Use “latitude, longitude”, e.g. 40.7128, -73.9573.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ sets */

function SetChips({ loc, sceneCountBySet, scriptSets }: { loc: Location; sceneCountBySet: Map<string, number>; scriptSets: { id: string; set: string; location?: Location; inScript: boolean }[] }) {
  const [text, setText] = useState('');
  const mine = new Set((loc.sets ?? []).map((s) => s.toUpperCase()));
  const suggestions = useMemo(
    () =>
      [...scriptSets]
        .filter((r) => r.inScript && !mine.has(r.id))
        .sort((a, b) => Number(!!a.location) - Number(!!b.location))
        .map((r) => r.set),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scriptSets, loc.sets],
  );
  const add = () => {
    const v = text.trim().toUpperCase();
    if (!v) return;
    assignSet(v, loc.id);
    setText('');
  };
  return (
    <div>
      <div className="row wrap" style={{ gap: 5 }}>
        {(loc.sets ?? []).map((s) => {
          const n = sceneCountBySet.get(s.toUpperCase());
          return (
            <span key={s} className={`chip loc-setchip ${n ? '' : 'unused'}`} title={n ? `${plural(n, 'scene')}` : 'Not in the script'}>
              {s}
              <span className="loc-setchip-n">{n ?? 0}</span>
              <button type="button" aria-label={`Remove ${s}`} title="Unassign set" onClick={() => removeSet(loc.id, s)}>
                <X size={12} />
              </button>
            </span>
          );
        })}
        {!loc.sets?.length && <span className="muted small">No sets assigned.</span>}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 10 }}>
        <div className="grow">
          <Combo
            size="sm"
            value={text}
            suggestions={suggestions}
            placeholder={suggestions.length ? 'Add a set from the script…' : 'Set name'}
            onChange={setText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button size="sm" icon={Plus} disabled={!text.trim()} onClick={add}>
          Add set
        </Button>
      </div>
    </div>
  );
}

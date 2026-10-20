/* Characters sub-page: board numbers, descriptions, who plays whom, scenes per character. */
import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Eye, FileText, GitMerge, ListOrdered, Plus, Trash2, UserRound, Users, X } from 'lucide-react';
import type { Character, ID } from '@/types';
import { listOps, useFormatters, useProject } from '@/store/project';
import { useScriptModel } from '@/derived/script';
import { navigate } from '@/store/app';
import { CAST_STATUSES, STRIP_COLORS } from '@/lib/constants';
import { matchesQuery, plural } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  EmptyState,
  IconButton,
  Input,
  Modal,
  NumberInput,
  SearchInput,
  Select,
  StatusBadge,
  Toolbar,
  type Column,
} from '@/ui';
import { addCharacter, deleteCharacter, mergeCharacters, renumberCharacters } from './actions';
import { characterStats, ColorDotPicker, GENDER_SUGGESTIONS, sortByBoard, tableMinWidth, type CharStats } from './util';

const ops = listOps<Character>((d) => d.characters, 'characters');

export function CharactersTab({ selectedId, onSelect, onOpenCast }: { selectedId: ID | null; onSelect: (id: ID | null) => void; onOpenCast: (castId: ID) => void }) {
  const characters = useProject((p) => p.characters);
  const cast = useProject((p) => p.cast);
  const model = useScriptModel();
  const fmt = useFormatters();
  const [q, setQ] = useState('');
  const [mergeId, setMergeId] = useState<ID | null>(null);
  const searchWrap = useRef<HTMLDivElement>(null);

  useCommand('find', () => {
    searchWrap.current?.querySelector('input')?.focus();
    return true;
  });

  const stats = useMemo(() => characterStats(characters, model), [characters, model]);
  const castById = useMemo(() => new Map(cast.map((m) => [m.id, m])), [cast]);
  const castOptions = useMemo(() => cast.map((m) => ({ value: m.id, label: m.name || 'Unnamed actor' })), [cast]);
  const dupNumbers = useMemo(() => {
    const seen = new Map<number, number>();
    for (const c of characters) if (c.number != null) seen.set(c.number, (seen.get(c.number) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [characters]);

  const rows = useMemo(() => {
    const sorted = sortByBoard(characters);
    if (!q.trim()) return sorted;
    return sorted.filter((c) => matchesQuery([c.name, ...(c.aliases ?? []), c.description, c.notes, castById.get(c.castId ?? '')?.name].join(' '), q));
  }, [characters, q, castById]);

  const selected = characters.find((c) => c.id === selectedId);
  const canDelete = (c: Character) => !!c.manual || !stats.get(c.id)?.speaking;
  const uncast = characters.filter((c) => !c.castId || !castById.has(c.castId)).length;

  const columns: Column<Character>[] = [
    {
      key: 'color',
      header: '',
      width: 38,
      sortable: false,
      render: (c) => <ColorDotPicker value={c.color} onChange={(color) => ops.update(c.id, { color })} />,
    },
    {
      key: 'number',
      header: '#',
      width: 62,
      sortValue: (c) => c.number ?? 1e9,
      render: (c) => (
        <NumberInput
          bare
          size="sm"
          value={c.number}
          className={c.number != null && dupNumbers.has(c.number) ? 'cast-dup' : undefined}
          title={c.number != null && dupNumbers.has(c.number) ? 'Duplicate board number' : 'Board / cast ID number used on strips and call sheets'}
          onChange={(number) => ops.update(c.id, { number: number == null ? undefined : Math.max(0, Math.round(number)) })}
        />
      ),
    },
    {
      key: 'name',
      header: 'Character',
      minWidth: 170,
      sortValue: (c) => c.name,
      render: (c) => {
        const st = stats.get(c.id);
        const locked = !c.manual && !!st?.speaking;
        return (
          <div className="cast-charname">
            {locked ? (
              <span className="strong" title="Name comes from the script's character cues — rename it in the script">
                {c.name}
              </span>
            ) : (
              <Input bare size="sm" value={c.name} placeholder="NAME" onChange={(v) => ops.update(c.id, { name: v.toUpperCase() })} />
            )}
            {!!c.aliases?.length && <span className="tiny muted ellipsis">aka {c.aliases.join(', ')}</span>}
            {!st?.speaking && !c.manual && (
              <Badge tone="warning" title="No dialogue for this name in the script">
                not in script
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'scenes',
      header: 'Scenes',
      width: 70,
      align: 'right',
      sortValue: (c) => stats.get(c.id)?.scenes.length ?? 0,
      render: (c) => <span className="num">{stats.get(c.id)?.scenes.length || '—'}</span>,
    },
    {
      key: 'dialogue',
      header: 'Lines / words',
      width: 100,
      align: 'right',
      sortValue: (c) => stats.get(c.id)?.words ?? 0,
      render: (c) => {
        const st = stats.get(c.id);
        return st?.speeches ? (
          <span className="muted" title={`${plural(st.speeches, 'speech', 'speeches')}, ${plural(st.words, 'word')}`}>
            {st.speeches} / {st.words}
          </span>
        ) : (
          <span className="muted">—</span>
        );
      },
    },
    { key: 'description', header: 'Description', type: 'textarea', minWidth: 200, placeholder: 'Who they are…' },
    { key: 'age', header: 'Age', type: 'text', width: 70, placeholder: '30s' },
    { key: 'gender', header: 'Gender', type: 'combo', width: 100, suggestions: GENDER_SUGGESTIONS },
    {
      key: 'castId',
      header: 'Played by',
      width: 170,
      sortValue: (c) => castById.get(c.castId ?? '')?.name ?? '~',
      render: (c) => (
        <Select
          bare
          size="sm"
          value={c.castId && castById.has(c.castId) ? c.castId : ''}
          placeholder="Uncast"
          options={castOptions}
          onChange={(v) => ops.update(c.id, { castId: v || undefined })}
        />
      ),
    },
    { key: 'notes', header: 'Notes', type: 'textarea', minWidth: 160 },
  ];

  if (characters.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No characters yet"
        description="Characters are created automatically from the character cues in your script. You can also add characters that don't speak (e.g. featured extras)."
        action={
          <div className="row">
            <Button icon={FileText} onClick={() => navigate('script')}>
              Open script
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => addCharacter().then((id) => id && onSelect(id))}>
              Add character
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <>
      <Toolbar>
        <div ref={searchWrap}>
          <SearchInput value={q} onChange={setQ} placeholder="Search characters…" />
        </div>
        <span className="muted small">
          {plural(characters.length, 'character')}
          {uncast > 0 && ` · ${uncast} uncast`}
        </span>
        <div className="spacer" />
        <Button icon={ListOrdered} onClick={() => renumberCharacters(model)} title="Number characters 1…n by scene count, then first appearance">
          Renumber by importance
        </Button>
        <Button icon={Plus} onClick={() => addCharacter().then((id) => id && onSelect(id))}>
          Add character
        </Button>
      </Toolbar>
      <div className="split">
        <div className="pane-main cast-pad">
          <div className="cast-xtable" style={{ ['--xt-minw' as string]: `${tableMinWidth(columns, 40)}px` } as React.CSSProperties}>
            <DataTable
              rows={rows}
              columns={columns}
              onChange={(id, patch) => ops.update(id, patch)}
              selectedId={selectedId ?? undefined}
              onRowClick={(c) => onSelect(c.id)}
              emptyText="No characters match your search."
              rowActions={(c) => [
                { label: 'Show scenes', icon: Eye, onClick: () => onSelect(c.id) },
                { label: 'Merge into…', icon: GitMerge, disabled: characters.length < 2, onClick: () => setMergeId(c.id) },
                { separator: true },
                { label: canDelete(c) ? 'Delete' : 'Delete (has dialogue in script)', icon: Trash2, danger: true, disabled: !canDelete(c), onClick: () => deleteCharacter(c.id).then((ok) => ok && selectedId === c.id && onSelect(null)) },
              ]}
            />
          </div>
        </div>
        {selected && (
          <aside className="pane-right cast-side">
            <CharacterPanel
              character={selected}
              stats={stats.get(selected.id)}
              canDelete={canDelete(selected)}
              onClose={() => onSelect(null)}
              onMerge={() => setMergeId(selected.id)}
              onDelete={() => deleteCharacter(selected.id).then((ok) => ok && onSelect(null))}
              onOpenCast={onOpenCast}
              eighths={fmt.eighths}
            />
          </aside>
        )}
      </div>
      {mergeId && <MergeDialog sourceId={mergeId} onClose={() => setMergeId(null)} onMerged={(target) => onSelect(target)} />}
    </>
  );
}

/* ------------------------------------------------------------------ side panel */

function CharacterPanel({
  character: c,
  stats,
  canDelete,
  onClose,
  onMerge,
  onDelete,
  onOpenCast,
  eighths,
}: {
  character: Character;
  stats?: CharStats;
  canDelete: boolean;
  onClose: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onOpenCast: (castId: ID) => void;
  eighths: (n?: number | null) => string;
}) {
  const cast = useProject((p) => p.cast);
  const actor = cast.find((m) => m.id === c.castId);
  const names = [c.name, ...(c.aliases ?? [])].map((n) => n.toUpperCase());
  const scenes = stats?.scenes ?? [];

  return (
    <div className="cast-side-inner">
      <div className="cast-side-head">
        <ColorDotPicker value={c.color} size={16} onChange={(color) => ops.update(c.id, { color })} />
        {c.number != null && <span className="cast-boardnum">{c.number}</span>}
        <h2 className="grow ellipsis" title={c.name}>
          {c.name}
        </h2>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
      </div>

      <div className="cast-side-stats">
        <div>
          <strong>{scenes.length}</strong>
          <span>{scenes.length === 1 ? 'scene' : 'scenes'}</span>
        </div>
        <div>
          <strong>{eighths(stats?.eighths ?? 0) || '0'}</strong>
          <span>pages</span>
        </div>
        <div>
          <strong>{stats?.speeches ?? 0}</strong>
          <span>speeches</span>
        </div>
        <div>
          <strong>{stats?.words ?? 0}</strong>
          <span>words</span>
        </div>
      </div>

      <div className="section-title">Played by</div>
      {actor ? (
        <button type="button" className="cast-actorlink" onClick={() => onOpenCast(actor.id)}>
          <Avatar name={actor.name || '?'} photo={actor.photo} size={34} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="strong ellipsis">{actor.name || 'Unnamed actor'}</div>
            <div className="tiny muted ellipsis">{[actor.phone, actor.email].filter(Boolean).join(' · ') || 'No contact details'}</div>
          </div>
          <StatusBadge value={actor.status} options={CAST_STATUSES} />
          <ArrowRight size={14} className="muted" />
        </button>
      ) : (
        <div className="cast-side-block">
          <Select
            value=""
            placeholder={cast.length ? 'Choose an actor…' : 'No cast members yet'}
            options={cast.map((m) => ({ value: m.id, label: m.name || 'Unnamed actor' }))}
            disabled={!cast.length}
            onChange={(v) => v && ops.update(c.id, { castId: v })}
          />
        </div>
      )}

      {!!c.aliases?.length && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>
            Also appears as
          </div>
          <div className="row wrap" style={{ gap: 4 }}>
            {c.aliases.map((a) => (
              <span key={a} className="chip">
                {a}
                <button type="button" aria-label={`Remove alias ${a}`} title="Remove alias" onClick={() => ops.update(c.id, { aliases: (c.aliases ?? []).filter((x) => x !== a) }, false)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </>
      )}

      <div className="section-title" style={{ marginTop: 16 }}>
        Scenes
      </div>
      {scenes.length === 0 ? (
        <div className="muted small cast-side-block">This character doesn't appear in any scene yet. Add them to scenes in the Script Breakdown.</div>
      ) : (
        <div className="cast-scenelist">
          {scenes.map((s) => {
            const strip = STRIP_COLORS[s.stripKey] ?? STRIP_COLORS.OTHER;
            const speaks = s.speaking.some((n) => names.includes(n));
            return (
              <button key={s.id} type="button" className="cast-scene" onClick={() => navigate('script', { sceneId: s.id })} title="Open in script">
                <span className="cast-scene-num" style={{ background: strip.bg, color: strip.fg }}>
                  {s.number}
                </span>
                <span className="grow ellipsis">{s.heading || 'Untitled scene'}</span>
                {!speaks && (
                  <span className="tiny muted" title="Present but no dialogue">
                    silent
                  </span>
                )}
                <span className="tiny muted num">{eighths(s.eighths)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        <Button size="sm" icon={GitMerge} onClick={onMerge}>
          Merge into…
        </Button>
        <div className="spacer" />
        <Button size="sm" variant="danger" icon={Trash2} disabled={!canDelete} title={canDelete ? undefined : 'Characters with dialogue come from the script'} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ merge */

function MergeDialog({ sourceId, onClose, onMerged }: { sourceId: ID; onClose: () => void; onMerged: (targetId: ID) => void }) {
  const characters = useProject((p) => p.characters);
  const cast = useProject((p) => p.cast);
  const source = characters.find((c) => c.id === sourceId);
  const [target, setTarget] = useState('');
  if (!source) return null;
  const others = sortByBoard(characters.filter((c) => c.id !== sourceId));
  const tgt = characters.find((c) => c.id === target);
  const srcActor = cast.find((m) => m.id === source.castId);
  const tgtActor = cast.find((m) => m.id === tgt?.castId);
  const submit = () => {
    if (!tgt) return;
    mergeCharacters(source.id, tgt.id);
    onMerged(tgt.id);
    onClose();
  };
  return (
    <Modal
      open
      size="sm"
      title={`Merge ${source.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={GitMerge} disabled={!tgt} onClick={submit}>
            Merge
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <div className="text-2">
          Use this when the same person appears under two names (e.g. “SAM” and “SAMANTHA”). <strong>{source.name}</strong> becomes an alias of the character you
          pick, and its scenes, wardrobe and shot links move over.
        </div>
        <Select
          value={target}
          placeholder="Merge into…"
          options={others.map((c) => ({ value: c.id, label: `${c.number != null ? `${c.number} · ` : ''}${c.name}` }))}
          onChange={setTarget}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        {tgt && srcActor && tgtActor && srcActor.id !== tgtActor.id && (
          <div className="cast-note warning">
            <UserRound size={14} /> {tgt.name} is played by {tgtActor.name}; {srcActor.name} will be unlinked from {source.name}.
          </div>
        )}
      </div>
    </Modal>
  );
}

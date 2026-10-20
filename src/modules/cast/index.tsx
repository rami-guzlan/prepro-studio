/* Cast & Characters module: Characters | Cast | Sizes. */
import './cast.css';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Ruler, UserPlus, Users, VenetianMask } from 'lucide-react';
import type { ID } from '@/types';
import { useProject } from '@/store/project';
import { readLS, useApp, writeLS } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { ExportMenu, Button, isModalOpen, ModuleHeader, UnderlineTabs } from '@/ui';
import { plural } from '@/lib/text';
import { addCastMember, addCharacter, deleteCastMember, deleteCharacter, exportCastCsv, exportCharactersCsv } from './actions';
import { CharactersTab } from './CharactersTab';
import { CastTab } from './CastTab';
import { SizesTab } from './SizesTab';
import { characterStats, isTypingTarget } from './util';

type Tab = 'characters' | 'cast' | 'sizes';

export default function CastModule() {
  const characters = useProject((p) => p.characters);
  const cast = useProject((p) => p.cast);
  const model = useScriptModel();
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);

  const [tab, setTabState] = useState<Tab>(() => readLS<Tab>('prepro.cast.tab', 'characters'));
  const setTab = (t: Tab) => {
    setTabState(t);
    writeLS('prepro.cast.tab', t);
  };
  const [selChar, setSelChar] = useState<ID | null>(null);
  const [selCast, setSelCast] = useState<ID | null>(null);
  const [focusName, setFocusName] = useState<ID | null>(null);

  // deep links: navigate('cast', { castId }) / ({ characterId }) / ({ tab })
  useEffect(() => {
    if (params?.castId) {
      setTab('cast');
      setSelCast(params.castId);
    } else if (params?.characterId) {
      setTab('characters');
      setSelChar(params.characterId);
    } else if (params?.tab === 'characters' || params?.tab === 'cast' || params?.tab === 'sizes') {
      setTab(params.tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const addActor = () => {
    const id = addCastMember();
    setTab('cast');
    setSelCast(id);
    setFocusName(id);
  };
  const addChar = () =>
    addCharacter().then((id) => {
      if (!id) return;
      setTab('characters');
      setSelChar(id);
    });
  const openCast = (id: ID) => {
    setTab('cast');
    setSelCast(id);
    setFocusName(null);
  };
  const openCharacter = (id: ID) => {
    setTab('characters');
    setSelChar(id);
  };

  // keyboard: Esc closes the detail panel, Delete removes the selected item
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isModalOpen() || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.popover')) return;
      if (e.key === 'Escape') {
        if (tab === 'cast' && selCast) setSelCast(null);
        else if (tab === 'characters' && selChar) setSelChar(null);
        else return;
        e.preventDefault();
      } else if (e.key === 'Delete') {
        if (tab === 'cast' && selCast) {
          e.preventDefault();
          deleteCastMember(selCast).then((ok) => ok && setSelCast(null));
        } else if (tab === 'characters' && selChar) {
          const c = characters.find((x) => x.id === selChar);
          if (!c) return;
          const st = characterStats([c], model).get(c.id);
          if (!c.manual && st?.speaking) return;
          e.preventDefault();
          deleteCharacter(selChar).then((ok) => ok && setSelChar(null));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, selCast, selChar, characters, model]);

  const confirmed = useMemo(() => cast.filter((m) => m.status === 'confirmed').length, [cast]);
  const uncast = useMemo(() => {
    const ids = new Set(cast.map((m) => m.id));
    return characters.filter((c) => !c.castId || !ids.has(c.castId)).length;
  }, [characters, cast]);

  const subtitle = [plural(characters.length, 'character'), `${plural(cast.length, 'cast member')} (${confirmed} confirmed)`, uncast ? `${uncast} uncast` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="module cast-module">
      <ModuleHeader
        title="Cast & Characters"
        subtitle={subtitle}
        icon={Users}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'cast-list', label: 'Cast list' },
                { id: 'cast-sheets', label: 'Cast sheets (one per actor)' },
                { id: 'character-breakdown', label: 'Character breakdown' },
                { id: 'size-sheet', label: 'Wardrobe size sheet' },
                { id: 'cast-release-tracker', label: 'Release & contract tracker' },
              ]}
              csv={[
                { label: 'Cast (CSV)', onClick: () => exportCastCsv() },
                { label: 'Characters (CSV)', onClick: () => exportCharactersCsv(model) },
              ]}
            />
            {tab === 'characters' ? (
              <Button variant="primary" icon={Plus} onClick={addChar}>
                Add character
              </Button>
            ) : (
              <Button variant="primary" icon={UserPlus} onClick={addActor}>
                Add cast member
              </Button>
            )}
          </>
        }
      />
      <UnderlineTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'characters', label: 'Characters', icon: VenetianMask, count: characters.length },
          { id: 'cast', label: 'Cast', icon: Users, count: cast.length },
          { id: 'sizes', label: 'Sizes', icon: Ruler },
        ]}
      />
      <div className="cast-tabbody">
        {tab === 'characters' && <CharactersTab selectedId={selChar} onSelect={setSelChar} onOpenCast={openCast} />}
        {tab === 'cast' && (
          <CastTab
            selectedId={selCast}
            focusNameId={focusName}
            onSelect={(id) => {
              setSelCast(id);
              setFocusName(null);
            }}
            onAdd={addActor}
            onOpenCharacter={openCharacter}
            onOpenSizes={() => setTab('sizes')}
          />
        )}
        {tab === 'sizes' && <SizesTab onAdd={addActor} onOpenCast={openCast} />}
      </div>
    </div>
  );
}

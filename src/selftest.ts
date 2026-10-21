/* Automated end-to-end check, run with `npm run selftest` (desktop only):
   builds the sample project in an isolated folder, opens every module screen
   (screenshots), renders every printable document to PDF, builds the merged
   production book and the script file exports, then quits. */
import { PRINT_DOCS } from '@/print/registry';
import { buildDoc, buildBookPdf } from '@/print/run';
import { toJob } from '@/print/build';
import { backend } from '@/backend';
import { createSampleProject } from '@/sample';
import { createAndOpen, openProjectById } from '@/shell/projectActions';
import { MODULES } from '@/modules/registry';
import { navigate } from '@/store/app';
import { getProject } from '@/store/project';
import { getScriptModel } from '@/derived/script';
import { toFountain, parseFountain } from '@/script-core/fountain';
import { toFdx, parseFdx } from '@/script-core/fdx';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSelftest() {
  const bridge = (window as any).prepro;
  const summary: Record<string, unknown> = { started: new Date().toISOString(), docs: [] as unknown[], modules: [] as unknown[], errors: [] as string[] };
  const errors = summary.errors as string[];
  window.addEventListener('error', (e) => errors.push(`window error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => errors.push(`unhandled rejection: ${String((e as PromiseRejectionEvent).reason)}`));
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(`console.error: ${args.map((a) => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' ').slice(0, 800)}`);
    origError(...args);
  };
  try {
    await wait(800);
    const p = await createSampleProject();
    await openProjectById(p.id, 'overview');
    await wait(1200);

    // every module screen
    for (const m of MODULES) {
      try {
        navigate(m.id);
        await wait(1400);
        const broken = document.body.innerText.includes('Something went wrong in this screen');
        (summary.modules as unknown[]).push({ id: m.id, ok: !broken });
        await bridge.selftestCapture(`screen-${m.id}.png`);
      } catch (e) {
        (summary.modules as unknown[]).push({ id: m.id, ok: false, error: String(e) });
      }
    }

    // Mind Dump tab + storyboard sizes
    navigate('script', { tab: 'mind' });
    await wait(1400);
    (summary.modules as unknown[]).push({ id: 'script-mind', ok: !document.body.innerText.includes('Something went wrong in this screen') && document.querySelectorAll('.md-note').length > 0 });
    await bridge.selftestCapture('screen-script-mind.png');
    summary.mindBoards = await checkMindBoards('screen-script-mind');
    navigate('storyboard');
    await wait(1200);
    const widths: Record<string, number> = {};
    for (const label of ['Small', 'Medium', 'Large']) {
      const btn = [...document.querySelectorAll('.tabs button')].find((x) => x.textContent?.trim() === label) as HTMLButtonElement | undefined;
      btn?.click();
      await wait(250);
      widths[label] = Math.round(document.querySelector('.sb-grid .sb-card')?.getBoundingClientRect().width ?? 0);
    }
    summary.storyboardSizes = widths;
    ([...document.querySelectorAll('.tabs button')].find((x) => x.textContent?.trim() === 'Medium') as HTMLButtonElement | undefined)?.click();

    // AI agent (MCP) tools run in-process + the connect dialog
    {
      const { callTool, TOOLS } = await import('@/agent');
      const { openAgentDialog, useAgent } = await import('@/agent/state');
      const read = async (name: string, args: Record<string, unknown> = {}) => {
        const r = await callTool(name, args);
        const text = r.result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
        return { ok: !r.result.isError, text };
      };
      const results: Record<string, boolean> = {};
      for (const name of ['get_app_state', 'list_scenes', 'get_schedule', 'list_documents', 'describe_data']) results[name] = (await read(name)).ok;
      results.get_script = /EXT\. CITY ROOFTOP/.test((await read('get_script', { sceneIds: ['1'] })).text);
      results.report = (await read('get_report', { report: 'readiness' })).ok;
      results.invalidArgsRejected = !(await read('list_items', { collection: 'nope' })).ok;
      summary.agent = { tools: TOOLS.length, results, ok: Object.values(results).every(Boolean) };
      navigate('overview');
      await wait(600);
      openAgentDialog();
      await wait(900);
      await bridge.selftestCapture('screen-agent-dialog.png');
      useAgent.setState({ dialogOpen: false });
    }

    // every printable document
    for (const def of PRINT_DOCS) {
      const t0 = performance.now();
      try {
        const doc = buildDoc(def.id, def.id === 'call-sheet' ? { allDays: true } : {});
        const bytes = await backend.renderPdfBytes!(toJob(doc));
        await bridge.selftestWrite(`${def.id}.pdf`, bytes);
        await bridge.selftestWrite(`${def.id}.html`, doc.html);
        (summary.docs as unknown[]).push({ id: def.id, ok: true, kb: Math.round(bytes.length / 1024), ms: Math.round(performance.now() - t0) });
      } catch (e) {
        (summary.docs as unknown[]).push({ id: def.id, ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) });
      }
    }

    // merged production book
    try {
      const book = await buildBookPdf(PRINT_DOCS.map((d) => ({ docId: d.id, options: d.id === 'call-sheet' ? { allDays: true } : undefined })));
      await bridge.selftestWrite('production-book.pdf', book);
      summary.book = { ok: true, kb: Math.round(book.length / 1024) };
    } catch (e) {
      summary.book = { ok: false, error: String(e) };
    }

    // script interchange round trips
    const proj = getProject();
    const model = getScriptModel(proj);
    const fountain = toFountain(model.paras, { titlePage: proj.script.titlePage });
    const fdx = toFdx(model.paras, { titlePage: proj.script.titlePage });
    await bridge.selftestWrite('script.fountain', fountain);
    await bridge.selftestWrite('script.fdx', fdx);
    const back1 = parseFountain(fountain);
    const back2 = parseFdx(fdx);
    const sig = (ps: { type: string; text: string }[]) => ps.map((x) => `${x.type}:${x.text}`).join('\n');
    summary.roundTrip = {
      fountain: sig(back1.paras) === sig(model.paras) ? 'identical' : 'different',
      fdx: sig(back2.paras) === sig(model.paras) ? 'identical' : 'different',
      paras: model.paras.length,
    };
    if (summary.roundTrip && (summary.roundTrip as any).fountain !== 'identical') await bridge.selftestWrite('roundtrip-fountain.txt', sig(back1.paras) + '\n-----\n' + sig(model.paras));
    if (summary.roundTrip && (summary.roundTrip as any).fdx !== 'identical') await bridge.selftestWrite('roundtrip-fdx.txt', sig(back2.paras) + '\n-----\n' + sig(model.paras));

    // a brand-new empty project (A/V script mode): every screen and document must cope with no data
    const blank = await createAndOpen({ title: 'Blank Corporate Test', projectType: 'corporate', withTemplates: true });
    const emptyResults: unknown[] = [];
    if (blank) {
      await wait(800);
      for (const m of MODULES) {
        navigate(m.id);
        await wait(700);
        const broken = document.body.innerText.includes('Something went wrong in this screen');
        emptyResults.push({ screen: m.id, ok: !broken });
        if (broken) await bridge.selftestCapture(`empty-screen-${m.id}.png`);
      }
      for (const def of PRINT_DOCS) {
        try {
          const doc = buildDoc(def.id, {});
          if (!doc.html.includes('</html>')) throw new Error('incomplete html');
          emptyResults.push({ doc: def.id, ok: true });
        } catch (e) {
          emptyResults.push({ doc: def.id, ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) });
        }
      }
      const av = await backend.renderPdfBytes!(toJob(buildDoc('av-script', {})));
      await bridge.selftestWrite('empty-av-script.pdf', av);
    }
    summary.emptyProject = emptyResults.filter((r: any) => !r.ok);
    summary.emptyChecked = emptyResults.length;

    // Marketing Spaces: the demo space (every screen, the content editor, every document) and an empty space
    {
      const { createSampleSpace } = await import('@/spaces/sample');
      const { openSpaceById, createSpaceAndOpen } = await import('@/shell/spaceActions');
      const { SPACE_MODULES } = await import('@/spaces/registry');
      const { SPACE_PRINT_DOCS } = await import('@/spaces/print/registry');
      const { buildSpaceDoc } = await import('@/spaces/print/run');
      const { openContent, closeContent } = await import('@/spaces/ui');
      const { getSpace } = await import('@/store/space');
      const { navigateSpace } = await import('@/store/app');
      const spaceResults: any[] = [];
      const sp = await createSampleSpace();
      await openSpaceById(sp.id, 'overview');
      await wait(1200);
      for (const m of SPACE_MODULES) {
        try {
          navigateSpace(m.id);
          await wait(1300);
          const broken = document.body.innerText.includes('Something went wrong in this screen');
          spaceResults.push({ screen: m.id, ok: !broken });
          await bridge.selftestCapture(`space-${m.id}.png`);
        } catch (e) {
          spaceResults.push({ screen: m.id, ok: false, error: String(e) });
        }
      }
      navigateSpace('ideas');
      await wait(1200);
      summary.spaceIdeaBoards = await checkMindBoards('space-ideas');
      // campaign resources, the resource viewer, brand kit groups, People & Brands views
      {
        const premiere = getSpace().campaigns.find((c) => c.name === 'Festival premiere');
        navigateSpace('campaigns', { campaignId: premiere?.id });
        await wait(1100);
        const sec = document.querySelector('.sp-res-section');
        sec?.scrollIntoView({ block: 'center' });
        await wait(300);
        spaceResults.push({ screen: 'campaign-resources', ok: document.querySelectorAll('.sp-res-section .sp-res-row').length >= 2 });
        await bridge.selftestCapture('space-campaign-resources.png');
        const pdfRow = [...document.querySelectorAll<HTMLElement>('.sp-res-section .sp-res-main')].find((b) => /one-pager/i.test(b.textContent ?? ''));
        pdfRow?.click();
        await wait(1600);
        spaceResults.push({ screen: 'resource-viewer', ok: !!document.querySelector('.sp-res-viewer iframe.sp-res-frame') });
        await bridge.selftestCapture('space-resource-viewer.png');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await wait(300);
        const trailer = getSpace().campaigns.find((c) => c.name === 'Trailer launch');
        navigateSpace('campaigns', { campaignId: trailer?.id });
        await wait(900);
        document.querySelector('.sp-res-section')?.scrollIntoView({ block: 'center' });
        ([...document.querySelectorAll<HTMLElement>('.sp-res-section .sp-res-main')][0])?.click();
        await wait(1000);
        spaceResults.push({ screen: 'resource-viewer-text', ok: !!document.querySelector('.sp-res-text-preview') });
        await bridge.selftestCapture('space-resource-viewer-md.png');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await wait(300);
        navigateSpace('assets');
        await wait(1100);
        document.getElementById('sp-assets-links')?.scrollIntoView({ block: 'start' });
        await wait(300);
        spaceResults.push({ screen: 'assets-campaign-groups', ok: document.querySelectorAll('.sp-res-group').length === getSpace().campaigns.length });
        await bridge.selftestCapture('space-assets-links.png');
        navigateSpace('people');
        await wait(1100);
        spaceResults.push({ screen: 'people-table', ok: document.querySelectorAll('.sp-crm-table tbody tr[data-row-id]').length > 0 });
        await bridge.selftestCapture('space-people-table.png');
        ([...document.querySelectorAll<HTMLElement>('.sp-crm-tab')][1])?.click();
        await wait(500);
        ([...document.querySelectorAll<HTMLButtonElement>('.module-toolbar .tabs button')].find((b) => b.textContent?.trim() === 'Board'))?.click();
        await wait(700);
        spaceResults.push({ screen: 'people-board', ok: document.querySelectorAll('.sp-crm-lane .sp-crm-card').length > 0 });
        await bridge.selftestCapture('space-people-board.png');
        (document.querySelector('.sp-crm-card') as HTMLElement | null)?.click();
        await wait(600);
        spaceResults.push({ screen: 'people-row-dialog', ok: !!document.querySelector('.sp-crm-form') });
        await bridge.selftestCapture('space-people-row.png');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await wait(300);
      }
      // content editor on every tab
      navigateSpace('content');
      await wait(900);
      const piece = getSpace().content.find((c) => c.title === 'Official trailer') ?? getSpace().content[0];
      for (const tab of ['brief', 'write', 'produce', 'publish', 'results'] as const) {
        openContent(piece.id, tab);
        await wait(700);
        const broken = document.body.innerText.includes('Something went wrong');
        spaceResults.push({ screen: `content-editor-${tab}`, ok: !broken });
        await bridge.selftestCapture(`space-content-editor-${tab}.png`);
      }
      closeContent();
      for (const def of SPACE_PRINT_DOCS) {
        const t0 = performance.now();
        try {
          const doc = buildSpaceDoc(def.id, {});
          await bridge.selftestWrite(`${def.id}.html`, doc.html);
          const bytes = await backend.renderPdfBytes!(toJob(doc));
          await bridge.selftestWrite(`${def.id}.pdf`, bytes);
          spaceResults.push({ doc: def.id, ok: true, kb: Math.round(bytes.length / 1024), ms: Math.round(performance.now() - t0) });
        } catch (e) {
          spaceResults.push({ doc: def.id, ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) });
        }
      }
      // an empty (blank) space: every screen and document must cope with no data
      const blankSpace = await createSpaceAndOpen({ title: 'Blank Space Test', type: 'other', withTemplate: false });
      if (blankSpace) {
        await wait(800);
        for (const m of SPACE_MODULES) {
          navigateSpace(m.id);
          await wait(650);
          const broken = document.body.innerText.includes('Something went wrong in this screen');
          spaceResults.push({ emptyScreen: m.id, ok: !broken });
          if (broken || m.id === 'overview' || m.id === 'content' || m.id === 'calendar') await bridge.selftestCapture(`space-empty-${m.id}.png`);
        }
        for (const def of SPACE_PRINT_DOCS) {
          try {
            const doc = buildSpaceDoc(def.id, {});
            if (!doc.html.includes('</html>')) throw new Error('incomplete html');
            spaceResults.push({ emptyDoc: def.id, ok: true });
          } catch (e) {
            spaceResults.push({ emptyDoc: def.id, ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) });
          }
        }
      }
      summary.spaces = { checked: spaceResults.length, docs: SPACE_PRINT_DOCS.length, failed: spaceResults.filter((r) => !r.ok) };
    }

    // Business Management, Personal Finances and Training: every screen and document with sample data, then empty
    {
      const { createSpace } = await import('@/spaces/defaults');
      const { modulesFor } = await import('@/spaces/registry');
      const { printDocsFor } = await import('@/spaces/print/registry');
      const { buildSpaceDoc } = await import('@/spaces/print/run');
      const { openSpaceById } = await import('@/shell/spaceActions');
      const { navigateSpace } = await import('@/store/app');
      const { sampleBusiness } = await import('@/spaces/business/sample');
      const { sampleFinance } = await import('@/spaces/finance/sample');
      const { sampleTraining } = await import('@/spaces/training/sample');
      const kinds = [
        { kind: 'business' as const, title: 'Selftest Studio LLC', data: sampleBusiness },
        { kind: 'finance' as const, title: 'Personal Finances', data: sampleFinance },
        { kind: 'training' as const, title: 'Training', data: sampleTraining },
      ];
      const results: any[] = [];
      for (const k of kinds) {
        for (const variant of ['sample', 'empty'] as const) {
          const sp = createSpace({ title: variant === 'empty' ? `${k.title} (empty)` : k.title, kind: k.kind, type: k.kind === 'business' ? 'business' : 'other', kindData: variant === 'sample' ? k.data() : undefined });
          await backend.createSpace(sp);
          if (k.kind === 'training' && variant === 'sample') {
            const { seedSamplePhotos } = await import('@/spaces/training/sample');
            await seedSamplePhotos(sp.id, sp.training!);
            await backend.saveSpace(sp);
          }
          await openSpaceById(sp.id, 'overview');
          await wait(900);
          for (const m of modulesFor(k.kind)) {
            try {
              navigateSpace(m.id);
              await wait(variant === 'sample' ? 1100 : 600);
              const broken = document.body.innerText.includes('Something went wrong in this screen');
              results.push({ kind: k.kind, variant, screen: m.id, ok: !broken });
              if (variant === 'sample' || broken) await bridge.selftestCapture(`${k.kind}-${variant}-${m.id}.png`);
            } catch (e) {
              results.push({ kind: k.kind, variant, screen: m.id, ok: false, error: String(e) });
            }
          }
          for (const def of printDocsFor(k.kind)) {
            try {
              const doc = buildSpaceDoc(def.id, {});
              if (variant === 'sample') {
                await bridge.selftestWrite(`${def.id}.html`, doc.html);
                const bytes = await backend.renderPdfBytes!(toJob(doc));
                await bridge.selftestWrite(`${def.id}.pdf`, bytes);
                results.push({ kind: k.kind, doc: def.id, ok: true, kb: Math.round(bytes.length / 1024) });
              } else results.push({ kind: k.kind, emptyDoc: def.id, ok: doc.html.includes('</html>') });
            } catch (e) {
              results.push({ kind: k.kind, variant, doc: def.id, ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) });
            }
          }
        }
      }
      summary.kinds = { checked: results.length, docs: kinds.map((k) => `${k.kind}: ${printDocsFor(k.kind).length}`).join(', '), failed: results.filter((r) => !r.ok) };
    }

    // the library: demo cards until removed (they stay in the Help menu)
    {
      const { leaveSpace } = await import('@/shell/spaceActions');
      const { setHomeTab } = await import('@/store/app');
      const { runCommand } = await import('@/lib/commands');
      await leaveSpace();
      const home: Record<string, unknown> = {};
      const demoCards = () => [...document.querySelectorAll('.project-card')].filter((c) => [...c.querySelectorAll('.badge, .initial')].some((x) => /^(Demo|DEMO)$/.test(x.textContent?.trim() ?? ''))).length;
      for (const tab of ['projects', 'spaces'] as const) {
        setHomeTab(tab);
        await wait(900);
        home[tab] = { cards: document.querySelectorAll('.project-card').length, demoCards: demoCards() };
        await bridge.selftestCapture(`home-${tab}.png`);
      }
      await backend.setDemosHidden({ project: true, space: true });
      runCommand('demos-changed');
      await wait(700);
      home.afterRemove = demoCards();
      setHomeTab('projects');
      await wait(500);
      home.afterRemoveProjects = demoCards();
      await bridge.selftestCapture('home-demos-removed.png');
      await backend.setDemosHidden({ project: false, space: false });
      runCommand('demos-changed');
      await wait(700);
      home.restored = demoCards();
      for (const tab of ['business', 'finance', 'training'] as const) {
        setHomeTab(tab);
        await wait(1200);
        await bridge.selftestCapture(`home-${tab}.png`);
      }
      setHomeTab('projects');
      summary.home = home;
    }
  } catch (e) {
    errors.push(`fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  } finally {
    summary.finished = new Date().toISOString();
    bridge.selftestDone(summary);
  }
}

/** Board tabs of the Mind Dump / Ideas screen: every layout keeps the write panel usable,
    and switching boards shows that board's notes. Captures each step. */
async function checkMindBoards(prefix: string): Promise<Record<string, unknown>> {
  const bridge = (window as any).prepro;
  const out: Record<string, unknown> = {};
  const tabs = () => [...document.querySelectorAll<HTMLElement>('.md-board-tab')];
  const layoutBtn = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.md-bar .tabs button')].find((b) => b.textContent?.trim() === label);
  out.boards = tabs().length;
  for (const label of ['Write', 'Split', 'Board']) {
    layoutBtn(label)?.click();
    await wait(450);
    const ta = document.querySelector<HTMLElement>('.md-textarea');
    out[label.toLowerCase()] = {
      textareaHeight: Math.round(ta?.getBoundingClientRect().height ?? 0),
      textareaWidth: Math.round(ta?.getBoundingClientRect().width ?? 0),
      notes: document.querySelectorAll('.md-note').length,
    };
    await bridge.selftestCapture(`${prefix}-${label.toLowerCase()}.png`);
  }
  layoutBtn('Split')?.click();
  await wait(300);
  const t = tabs();
  if (t.length > 1) {
    const before = document.querySelectorAll('.md-note').length;
    t[1].click();
    await wait(600);
    out.secondBoard = { name: t[1].querySelector('.md-board-name')?.textContent, notes: document.querySelectorAll('.md-note').length, before, active: t[1].classList.contains('on') };
    await bridge.selftestCapture(`${prefix}-board2.png`);
    tabs()[0].click();
    await wait(400);
  }
  return out;
}

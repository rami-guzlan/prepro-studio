/* ==========================================================================
   AI agent bridge (renderer side of the local MCP server).

   electron/mcp.cjs speaks MCP over HTTP and forwards tools/call requests here
   over IPC. Each call is validated against the tool's input schema, run
   against the live project store (wrapped in ONE undo step) and answered with
   MCP content blocks. Calls run one at a time, in order.
   ========================================================================== */
import { asOneStep, useProjectStore } from '@/store/project';
import { asOneSpaceStep, useSpaceStore } from '@/store/space';
import { runPreSaveHooks } from '@/store/autosave';
import { AgentError, journal, openKind, project } from './ctx';
import { validate } from './schema';
import type { ToolDef, ToolReturn } from './tool';
import { INSTRUCTIONS, PROMPTS } from './instructions';
import { appTools } from './tools/app';
import { dataTools } from './tools/data';
import { scriptTools } from './tools/script';
import { visualTools } from './tools/visual';
import { productionTools } from './tools/production';
import { outputTools } from './tools/output';
import { spaceTools } from './tools/spaces';
import { crmTools } from './tools/crm';
import { outreachTools } from './tools/outreach';
import { businessTools } from './kinds/business';
import { businessSalesTools } from './kinds/business-sales';
import { businessWorkTools } from './kinds/business-work';
import { businessLibraryTools } from './kinds/business-library';
import { financeTools } from './kinds/finance';
import { trainingTools } from './kinds/training';
import { coachTools } from './tools/coach';
import { designSystemTools } from './kinds/designSystem';

export const TOOLS: ToolDef[] = [...appTools, ...spaceTools, ...designSystemTools, ...crmTools, ...outreachTools, ...businessTools, ...businessSalesTools, ...businessWorkTools, ...businessLibraryTools, ...financeTools, ...trainingTools, ...coachTools, ...dataTools, ...scriptTools, ...visualTools, ...productionTools, ...outputTools];
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
/** owner-only areas: the hosted version hides these tools from everyone else's agents */
const AREA = new Map<string, string>([...financeTools.map((t) => [t.name, 'finance'] as const), ...trainingTools.map((t) => [t.name, 'training'] as const)]);

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export interface CallResult {
  content: Content[];
  isError?: boolean;
}

function errorResult(text: string): CallResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function toResult(out: ToolReturn): CallResult {
  const content: Content[] = [];
  if (out.text) content.push({ type: 'text', text: out.text });
  if (out.data !== undefined) content.push({ type: 'text', text: JSON.stringify(out.data) });
  for (const img of out.images ?? []) content.push({ type: 'image', data: img.data, mimeType: img.mimeType });
  if (!content.length) content.push({ type: 'text', text: out.summary ?? 'Done.' });
  return { content };
}

export function describeTools() {
  return {
    instructions: INSTRUCTIONS,
    prompts: PROMPTS,
    tools: TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.input,
      annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, idempotentHint: !!t.readOnly, openWorldHint: false },
      ...(AREA.has(t.name) ? { _meta: { 'prepro/area': AREA.get(t.name) } } : {}),
    })),
  };
}

/** Run one tool call (also used by the self-test). */
export async function callTool(name: string, args: unknown): Promise<{ result: CallResult; summary?: string }> {
  const tool = BY_NAME.get(name);
  if (!tool) return { result: errorResult(`Unknown tool: ${name}`) };
  const a = (args && typeof args === 'object' && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
  const errs = validate(tool.input, a);
  if (errs.length) return { result: errorResult(`Invalid arguments for ${name}:\n- ${errs.slice(0, 10).join('\n- ')}`) };
  if (!tool.global) {
    try {
      project();
    } catch (e) {
      return { result: errorResult(e instanceof Error ? e.message : String(e)) };
    }
  }
  runPreSaveHooks();
  const mutating = !tool.readOnly && !tool.noStep;
  try {
    if (openKind() === 'space') {
      const before = useSpaceStore.getState();
      const sid = before.space?.id;
      const out = mutating ? await asOneSpaceStep(() => tool.run(a)) : await tool.run(a);
      const after = useSpaceStore.getState();
      if (mutating && sid && after.space?.id === sid && after.version !== before.version) {
        journal.push({ tool: name, summary: out.summary ?? name, projectId: sid, kind: 'space', version: after.version });
        if (journal.length > 60) journal.shift();
      }
      return { result: toResult(out), summary: out.summary };
    }
    const before = useProjectStore.getState();
    const pid = before.project?.id;
    const docBefore = before.project?.script.doc;
    const out = mutating ? await asOneStep(() => tool.run(a)) : await tool.run(a);
    const after = useProjectStore.getState();
    if (mutating && pid && after.project?.id === pid && after.version !== before.version) {
      journal.push({ tool: name, summary: out.summary ?? name, projectId: pid, kind: 'project', version: after.version, scriptBefore: after.project.script.doc !== docBefore ? docBefore : undefined });
      if (journal.length > 60) journal.shift();
    }
    return { result: toResult(out), summary: out.summary };
  } catch (e) {
    if (!(e instanceof AgentError)) console.error(`[agent] ${name} failed`, e);
    const msg = e instanceof AgentError ? e.message : `${name} failed: ${e instanceof Error ? e.message : String(e)}`;
    return { result: errorResult(msg) };
  }
}

let started = false;

/** Connect to the MCP server: the desktop main process, or the cloud server's relay (src/backend/live.ts). */
export function startAgentServer(m: { onCall: Function; respond: Function; ready: Function } | undefined = window.prepro?.mcp) {
  if (!m || started) return;
  started = true;
  let queue: Promise<unknown> = Promise.resolve();
  m.onCall((req: { reqId: string; name: string; args: unknown }) => {
    queue = queue
      .then(() => callTool(req.name, req.args))
      .then(
        (res) => m.respond({ reqId: req.reqId, result: res.result, summary: res.summary }),
        (e) => m.respond({ reqId: req.reqId, error: String(e instanceof Error ? e.message : e) }),
      );
  });
  m.ready(describeTools());
}

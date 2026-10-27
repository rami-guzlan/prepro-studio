/* Lightweight agent connection state for the UI (sidebar indicator, connect
   dialog). Fed by activity events from the main-process MCP server. Does not
   load the tools themselves (those are in a lazily loaded chunk). */
import { create } from 'zustand';
import { toast } from '@/ui/Toast';

export interface AgentActivity {
  at: number;
  tool: string;
  ok: boolean;
  ms?: number;
  summary?: string;
}

interface AgentState {
  /** a client connected during this session */
  client: string | null;
  connectedAt: number;
  /** tool currently running */
  busy: string | null;
  last: AgentActivity | null;
  feed: AgentActivity[];
  dialogOpen: boolean;
}

export const useAgent = create<AgentState>(() => ({ client: null, connectedAt: 0, busy: null, last: null, feed: [], dialogOpen: false }));

export function openAgentDialog() {
  // hosted version: tokens and connectors are set up on the server's Connect page
  if ((window as any).__PREPRO_CLOUD__) {
    window.open('/connect', '_blank', 'noopener');
    return;
  }
  useAgent.setState({ dialogOpen: true });
}

let started = false;

export function initAgentActivity(m: { onActivity: Function } | undefined = window.prepro?.mcp) {
  if (!m || started) return;
  started = true;
  m.onActivity((ev: any) => {
    if (ev.type === 'connect') {
      const name = ev.client?.title || ev.client?.name || 'An AI agent';
      const first = !useAgent.getState().client;
      useAgent.setState({ client: name, connectedAt: ev.at });
      if (first) toast(`${name} connected to PrePro Studio`, 'info', { duration: 5000 });
    } else if (ev.type === 'start') {
      useAgent.setState({ busy: ev.tool });
    } else if (ev.type === 'end') {
      const a: AgentActivity = { at: ev.at, tool: ev.tool, ok: ev.ok, ms: ev.ms, summary: ev.summary };
      useAgent.setState((s) => ({ busy: null, last: a, client: s.client ?? 'AI agent', feed: [...s.feed, a].slice(-60) }));
    }
  });
}

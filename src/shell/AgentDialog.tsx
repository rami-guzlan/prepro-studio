/* "Connect an AI agent" — status of the local MCP server and copy-paste setup
   for Claude Desktop, Claude Code and other MCP clients. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Check, CircleAlert, Copy, Plug, RefreshCw } from 'lucide-react';
import type { McpStatus } from '@/backend/electron';
import { useAgent } from '@/agent/state';
import { Badge, Button, Modal, NumberInput, Switch, Tabs, toast } from '@/ui';

type Tab = 'desktop' | 'code' | 'other';

function copy(text: string, what = 'Copied') {
  navigator.clipboard.writeText(text).then(
    () => toast(what, 'success', { duration: 1800 }),
    () => toast('Could not copy to the clipboard', 'error'),
  );
}

function CodeBlock({ text, label }: { text: string; label?: string }) {
  return (
    <div className="agent-code">
      {label && <div className="agent-code-label">{label}</div>}
      <pre className="mono">{text}</pre>
      <Button size="sm" variant="ghost" icon={Copy} className="agent-code-copy" onClick={() => copy(text)}>
        Copy
      </Button>
    </div>
  );
}

function timeAgo(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AgentDialog() {
  const open = useAgent((s) => s.dialogOpen);
  const feed = useAgent((s) => s.feed);
  const client = useAgent((s) => s.client);
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [tab, setTab] = useState<Tab>('desktop');
  const [busy, setBusy] = useState(false);
  const [port, setPort] = useState<number | undefined>();
  const mcp = window.prepro?.mcp;

  const refresh = useCallback(async () => {
    if (!mcp) return;
    const st = await mcp.status();
    setStatus(st);
    setPort(st.configuredPort);
  }, [mcp]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh, feed.length]);

  const close = () => useAgent.setState({ dialogOpen: false });

  const url = status?.url ?? 'http://127.0.0.1:39217/mcp';
  const stdioJson = useMemo(() => (status ? JSON.stringify({ mcpServers: { 'prepro-studio': status.stdio } }, null, 2) : ''), [status]);
  const urlJson = JSON.stringify({ mcpServers: { 'prepro-studio': { type: 'http', url } } }, null, 2);
  const codeCmd = `claude mcp add --transport http --scope user prepro-studio ${url}`;
  const installed = status?.claudeDesktop.some((c) => c.installed);
  const desktopFound = status?.claudeDesktop.some((c) => c.exists || c.dirExists);

  const apply = async (patch: { enabled?: boolean; port?: number }) => {
    if (!mcp) return;
    setBusy(true);
    try {
      const st = await mcp.setConfig(patch);
      if (st.error) toast(st.error, 'error');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const installDesktop = async () => {
    if (!mcp) return;
    setBusy(true);
    try {
      const res = await mcp.installClaudeDesktop();
      toast(`Added to Claude Desktop. Quit Claude completely (tray icon → Quit) and reopen it to load PrePro Studio.`, 'success', { duration: 9000 });
      if (res.written.length > 1) console.info('Claude Desktop configs written:', res.written);
      await refresh();
    } catch (e) {
      toast(`Could not update the Claude Desktop config: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const recent = useMemo(() => {
    const fromMain = (status?.activity ?? []).filter((a) => a.type === 'end').map((a) => ({ at: a.at, tool: a.tool ?? '', ok: !!a.ok, summary: a.summary }));
    const all = [...fromMain, ...feed];
    const seen = new Set<string>();
    return all
      .filter((a) => {
        const k = `${a.at}-${a.tool}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.at - a.at)
      .slice(0, 12);
  }, [status, feed]);

  if (!mcp) {
    return (
      <Modal open={open} onClose={close} title="Connect an AI agent" size="md">
        <p className="muted">AI agents connect to the desktop app. Open PrePro Studio on your PC to use this.</p>
      </Modal>
    );
  }

  const running = !!status?.running;
  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <span className="row" style={{ gap: 8 }}>
          <Bot size={18} /> Connect an AI agent
        </span>
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={RefreshCw} onClick={refresh}>
            Refresh
          </Button>
          <div className="spacer" />
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </>
      }
    >
      <div className="agent-dlg">
        <p className="agent-intro">
          While PrePro Studio is open it runs a local <b>MCP server</b>. Claude, or any AI tool that supports MCP, can use it to read and edit everything in your projects that you can:
          script, Mind Dump, storyboards, shots, lighting, cast, crew, locations, breakdown, schedule, call sheets, budget, post and PDFs. Changes show up live and Ctrl+Z undoes them.
        </p>

        <div className={`agent-status ${running ? 'on' : status?.error ? 'err' : 'off'}`}>
          <span className="dot" />
          <div className="grow">
            <div className="agent-status-title">
              {running ? 'Agent server running' : status?.error ? 'Agent server could not start' : 'Agent server is off'}
              {client && running && (
                <Badge tone="accent" style={{ marginLeft: 8 }}>
                  {client} connected
                </Badge>
              )}
            </div>
            <div className="muted small mono">{running ? url : status?.error || 'Turn it on to let AI agents connect.'}</div>
          </div>
          <Switch checked={status?.enabled ?? true} disabled={busy} onChange={(v) => apply({ enabled: v })} label="Start with PrePro Studio" />
        </div>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'desktop', label: 'Claude Desktop' },
            { id: 'code', label: 'Claude Code' },
            { id: 'other', label: 'Other AI tools' },
          ]}
          style={{ marginTop: 14 }}
        />

        {tab === 'desktop' && (
          <div className="agent-tab">
            <p>
              One click adds PrePro Studio to Claude Desktop. Then quit Claude completely (tray icon → <i>Quit</i>) and reopen it: PrePro Studio’s tools show up in the
              connectors / tools menu of a chat. If PrePro Studio is closed when Claude needs it, it starts automatically.
            </p>
            <div className="row" style={{ gap: 10, margin: '10px 0 14px' }}>
              <Button variant="primary" icon={installed ? Check : Plug} disabled={busy} onClick={installDesktop}>
                {installed ? 'Added — update the entry' : 'Add PrePro Studio to Claude Desktop'}
              </Button>
              {!desktopFound && (
                <span className="muted small row" style={{ gap: 6 }}>
                  <CircleAlert size={14} /> Claude Desktop’s settings folder wasn’t found; it will be created.
                </span>
              )}
            </div>
            <CodeBlock label="Or add this to claude_desktop_config.json yourself (Claude → Settings → Developer → Edit Config)" text={stdioJson} />
          </div>
        )}

        {tab === 'code' && (
          <div className="agent-tab">
            <p>Run this once in a terminal. Claude Code (in the terminal, VS Code, JetBrains or the Code tab of the Claude app) then has PrePro Studio in every new session.</p>
            <CodeBlock text={codeCmd} />
            <p className="muted small" style={{ marginTop: 10 }}>
              For one project only, put this in a <span className="mono">.mcp.json</span> file in that folder instead:
            </p>
            <CodeBlock text={urlJson} />
          </div>
        )}

        {tab === 'other' && (
          <div className="agent-tab">
            <p>Cursor, VS Code, Windsurf and other MCP clients can connect with the server URL (Streamable HTTP transport):</p>
            <CodeBlock text={url} label="Server URL" />
            <p className="muted small" style={{ marginTop: 10 }}>
              Apps that only launch servers as a command (stdio) can use the bridge instead:
            </p>
            <CodeBlock text={stdioJson} />
            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <span className="small">Port</span>
              <NumberInput value={port} onChange={(v) => setPort(v ?? undefined)} size="sm" style={{ width: 100 }} />
              <Button size="sm" disabled={busy || !port || port === status?.configuredPort} onClick={() => port && apply({ port: Math.round(port) })}>
                Change port
              </Button>
              <span className="muted small">Default 39217. Only this computer can connect.</span>
            </div>
          </div>
        )}

        <div className="agent-activity">
          <div className="agent-activity-title">Recent agent activity</div>
          {recent.length === 0 ? (
            <div className="muted small">Nothing yet. Try asking your agent: “Open my latest PrePro Studio project and break down the script”, or “Plan a 2-day shoot starting next Saturday”.</div>
          ) : (
            <ul>
              {recent.map((a) => (
                <li key={`${a.at}-${a.tool}`} className={a.ok ? '' : 'bad'}>
                  <span className="when">{timeAgo(a.at)}</span>
                  <span className="what">{a.summary || a.tool.replace(/_/g, ' ')}</span>
                  {!a.ok && <span className="err">failed</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Small status pill for the sidebar: idle / connected / working. */
export function AgentIndicator({ compact }: { compact?: boolean }) {
  const client = useAgent((s) => s.client);
  const busy = useAgent((s) => s.busy);
  const last = useAgent((s) => s.last);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);
  if (!window.prepro?.mcp) return null;
  const recentlyActive = last && Date.now() - last.at < 4000;
  const state = busy ? 'busy' : client ? 'on' : 'idle';
  const label = busy ? `${client ?? 'Agent'} is working…` : recentlyActive && last?.summary ? last.summary : client ? `${client} connected` : 'Connect an AI agent';
  return (
    <button className={`agent-pill ${state}`} onClick={() => useAgent.setState({ dialogOpen: true })} title={last?.summary ? `Last: ${last.summary}` : 'Let Claude or another AI agent work in PrePro Studio'}>
      <Bot size={15} />
      {!compact && <span className="ellipsis">{label}</span>}
      <span className="dot" />
    </button>
  );
}

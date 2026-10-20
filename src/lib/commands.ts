/* Tiny command bus. Menu items (desktop app) and global shortcuts emit
   commands; modules can handle them while mounted:

     useCommand('find', () => { openFindBar(); return true; });

   A handler returning true marks the command as handled (stops other handlers). */
import { useEffect, useRef } from 'react';

export type CommandHandler = (arg?: unknown) => boolean | void;

const handlers = new Map<string, CommandHandler[]>();

export function onCommand(cmd: string, fn: CommandHandler): () => void {
  const list = handlers.get(cmd) ?? [];
  list.unshift(fn); // most recently mounted wins
  handlers.set(cmd, list);
  return () => {
    const l = handlers.get(cmd);
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  };
}

export function runCommand(cmd: string, arg?: unknown): boolean {
  const list = handlers.get(cmd);
  if (!list) return false;
  for (const fn of [...list]) {
    if (fn(arg) === true) return true;
  }
  return false;
}

export function useCommand(cmd: string, fn: CommandHandler, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    return onCommand(cmd, (arg) => ref.current(arg));
  }, [cmd, enabled]);
}

/* Agent tool definition. Tools run in the renderer against the live store. */
import type { JSONSchema } from './schema';

export interface ImageOut {
  /** base64 */
  data: string;
  mimeType: string;
}

export interface ToolReturn {
  /** JSON payload returned to the agent */
  data?: unknown;
  /** plain text instead of / before the JSON */
  text?: string;
  /** one line for the in-app activity feed ("Added 3 cast members") */
  summary?: string;
  images?: ImageOut[];
}

export interface ToolDef<A = any> {
  name: string;
  title: string;
  description: string;
  input: JSONSchema;
  /** never changes anything */
  readOnly?: boolean;
  /** may delete data */
  destructive?: boolean;
  /** works without an open project (default: needs one) */
  global?: boolean;
  /** manages its own undo steps / switches projects (not wrapped in one undo step) */
  noStep?: boolean;
  run(args: A): Promise<ToolReturn> | ToolReturn;
}

export function defineTool<A = any>(t: ToolDef<A>): ToolDef<A> {
  return t;
}

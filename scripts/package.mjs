// Packages the built app (dist/ + electron/) into a standalone Windows folder:
//   release/PrePro Studio-win32-x64/PrePro Studio.exe
// Only the files needed at runtime are copied (the UI is already bundled by Vite).
import { packager } from '@electron/packager';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

const keep = [/^\/package\.json$/, /^\/dist(\/|$)/, /^\/electron(\/|$)/];
const icon = path.join(root, 'electron', 'icon.ico');

const paths = await packager({
  dir: root,
  out: path.join(root, 'release'),
  name: 'PrePro Studio',
  executableName: 'PrePro Studio',
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  asar: true,
  prune: false,
  icon: existsSync(icon) ? icon : undefined,
  // stdio bridge for MCP clients (Claude Desktop): run outside the asar with the app's own exe
  extraResource: [path.join(root, 'electron', 'mcp-bridge.cjs')],
  appCopyright: 'PrePro Studio',
  win32metadata: {
    CompanyName: 'PrePro Studio',
    FileDescription: 'PrePro Studio — pre-production & post planning',
    ProductName: 'PrePro Studio',
  },
  ignore: (p) => {
    if (!p) return false;
    const norm = p.replace(/\\/g, '/');
    return !keep.some((re) => re.test(norm));
  },
});
// keep only English UI locales (Chromium falls back to en-US) — saves ~45 MB
import { readdirSync, rmSync } from 'node:fs';
for (const out of paths) {
  const loc = path.join(out, 'locales');
  for (const f of readdirSync(loc)) if (!/^en-(US|GB)\.pak$/.test(f)) rmSync(path.join(loc, f));
}
console.log('Packaged to:', paths.join(', '));

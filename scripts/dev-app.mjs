// Starts the Electron shell against the running Vite dev server (npm run dev).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron');
const url = process.env.PREPRO_DEV_URL || 'http://localhost:5173';

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, PREPRO_DEV_URL: url },
});
child.on('exit', (code) => process.exit(code ?? 0));

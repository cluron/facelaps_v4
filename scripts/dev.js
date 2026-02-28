#!/usr/bin/env node
/**
 * Lance dev en trouvant un port API libre (3001, 3002, …) et en le passant à Vite.
 */
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function freePort(start = 3001, max = 3010) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && start < max) resolve(freePort(start + 1, max));
      else reject(err);
    });
    server.once('listening', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.listen(start, '127.0.0.1');
  });
}

async function main() {
  const apiPort = await freePort(3001);
  const envLocal = join(root, '.env.development.local');
  writeFileSync(envLocal, `VITE_API_PORT=${apiPort}\n`, 'utf8');

  const env = { ...process.env, PORT: String(apiPort) };
  const child = spawn('npx', ['concurrently', 'npm run dev:server', 'npm run dev:client'], {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

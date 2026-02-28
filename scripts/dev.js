#!/usr/bin/env node
/**
 * Lance dev en trouvant un port API libre (3001, 3002, …) et en le passant à Vite.
 * Tue les processus qui tiennent déjà 3001–3010 pour éviter EADDRINUSE.
 */
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeMajor < 24) {
  console.error('');
  console.error(`⚠️  Ce projet demande Node 24+. Tu utilises actuellement Node ${process.version} (${process.execPath}).`);
  console.error('   Utilise nvm : nvm use   (puis npm run dev)');
  console.error('   Ou installe Node 24 et assure-toi qu\'il est dans ton PATH.');
  console.error('');
  process.exit(1);
}

function killPorts(min = 3001, max = 3010) {
  const run = (port) =>
    new Promise((resolve) => {
      const args = process.platform === 'win32'
        ? ['/c', 'for /f "tokens=5" %a in (\'netstat -ano ^| findstr :' + port + '\') do taskkill /F /PID %a 2>nul']
        : ['-c', `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`];
      const child = spawn(process.platform === 'win32' ? 'cmd' : 'sh', args, { stdio: 'ignore' });
      child.on('close', resolve);
    });
  return Promise.all(Array.from({ length: max - min + 1 }, (_, i) => run(min + i))).then(() => {});
}

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
  await killPorts(3001, 3010);
  await new Promise((r) => setTimeout(r, 300));
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

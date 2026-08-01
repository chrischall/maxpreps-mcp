import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'dist', 'bundle.js');
const BIN = join(ROOT, 'dist', 'index.js');

/**
 * Drive a real `initialize` + `tools/list` handshake against a spawned server.
 * Everything is mocked in the unit tests; this is the only place the actual
 * shipped artifacts are executed, so it is what catches a wrong `bin` path or an
 * eager import of a dependency the bundle externalises.
 */
function handshake(entry: string, cwd: string): Promise<{ tools: { name: string }[]; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out; stderr: ${stderr}`));
    }, 30_000);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        let msg: { id?: number; result?: { tools?: { name: string }[] } };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 2 && msg.result?.tools) {
          clearTimeout(timer);
          child.kill();
          resolve({ tools: msg.result.tools, stderr });
        }
      }
    });
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timer);
        reject(new Error(`exited ${code}; stderr: ${stderr}`));
      }
    });

    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'boot-test', version: '0' },
        },
      }) + '\n',
    );
    setTimeout(() => {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    }, 400);
  });
}

describe('server boot', () => {
  beforeAll(() => {
    if (!existsSync(BUNDLE) || !existsSync(BIN)) {
      throw new Error('run `npm run build` before the boot test');
    }
  });

  it('the .mcpb bundle boots with no node_modules and lists its tools', async () => {
    // The .mcpb ships dist/bundle.js + package.json and nothing else, so an
    // eager import of an externalised dep would crash here and only here.
    const dir = mkdtempSync(join(tmpdir(), 'maxpreps-mcpb-'));
    copyFileSync(BUNDLE, join(dir, 'bundle.js'));
    copyFileSync(join(ROOT, 'package.json'), join(dir, 'package.json'));
    const { tools } = await handshake(join(dir, 'bundle.js'), dir);
    // Deliberately a floor, not an exact count: PR CI tests the branch merged
    // with main, so a sibling PR adding a tool must not break this.
    expect(tools.length).toBeGreaterThanOrEqual(15);
    expect(tools.map((t) => t.name)).toContain('maxpreps_healthcheck');
  }, 40_000);

  it('the npm bin entry point boots from the package root', async () => {
    // Guards the `bin` path against a tsconfig rootDir slip emitting dist/src/.
    const { tools } = await handshake(BIN, ROOT);
    expect(tools.length).toBeGreaterThanOrEqual(15);
  }, 40_000);

  it('boots without contacting MaxPreps', async () => {
    // No credentials exist, but the server must also not do network I/O at
    // startup — a host's install-time probe has to answer instantly.
    const { stderr } = await handshake(BIN, ROOT);
    expect(stderr).not.toMatch(/unreachable|ENOTFOUND|fetch failed/i);
  }, 40_000);
});

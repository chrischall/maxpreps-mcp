// Invariant: the Claude Code plugin manifest points at its MCP config under the
// key Claude Code actually reads (`mcpServers`). A stray `mcp` key is silently
// ignored at load time — it only "works" when the path happens to be the
// default ./.mcp.json, and breaks the install as soon as the path differs.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = JSON.parse(
  readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
) as Record<string, unknown>;

describe('plugin packaging', () => {
  it('declares its MCP config under mcpServers, not the ignored mcp key', () => {
    expect(plugin).not.toHaveProperty('mcp');
    expect(typeof plugin.mcpServers).toBe('string');
  });

  it('points mcpServers at a file that exists', () => {
    expect(existsSync(join(ROOT, plugin.mcpServers as string))).toBe(true);
  });
});

const readJson = <T>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as T;

describe('.mcp.json', () => {
  // A git-source plugin install never builds the repo, so a launch path into
  // the gitignored dist/ fails to start; run the published package instead
  // (fleet-audit#1195).
  it('launches the published npm package, not a dist/ path', () => {
    const pkg = readJson<{ name: string }>('package.json');
    const cfg = readJson<{ mcpServers: Record<string, { command: string; args: string[] }> }>('.mcp.json');
    const servers = Object.values(cfg.mcpServers);
    expect(servers).toHaveLength(1);
    expect(servers[0]!.command).toBe('npx');
    expect(servers[0]!.args).toEqual(['-y', pkg.name]);
    expect(JSON.stringify(cfg)).not.toMatch(/dist\//);
  });
});

describe('allowScripts', () => {
  // An approval for a version the lock does not install vets nothing — and a
  // strict allow-scripts run would skip the installed package's postinstall.
  it('approves exactly the versions the lockfile installs', () => {
    const pkg = readJson<{ allowScripts?: Record<string, boolean> }>('package.json');
    const lock = readJson<{ packages: Record<string, { version?: string }> }>('package-lock.json');
    const stale = Object.keys(pkg.allowScripts ?? {}).filter((key) => {
      const at = key.lastIndexOf('@');
      const name = key.slice(0, at);
      return lock.packages[`node_modules/${name}`]?.version !== key.slice(at + 1);
    });
    expect(stale).toEqual([]);
  });
});

import { describe, it, expect, vi } from 'vitest';

// No network: the hints are read off tools/list, never by calling a tool.
vi.mock('../src/client.js', () => ({ client: { page: vi.fn(), healthcheck: vi.fn() } }));

const { createTestHarness } = await import('./helpers.js');
const { registerSearchTools } = await import('../src/tools/search.js');
const { registerSchoolTools } = await import('../src/tools/school.js');
const { registerTeamTools } = await import('../src/tools/team.js');
const { registerScheduleTools } = await import('../src/tools/schedule.js');
const { registerRosterTools } = await import('../src/tools/roster.js');
const { registerStatsTools } = await import('../src/tools/stats.js');
const { registerAthleteTools } = await import('../src/tools/athlete.js');
const { registerRankingsTools } = await import('../src/tools/rankings.js');
const { registerStandingsTools } = await import('../src/tools/standings.js');
const { registerStatLeaderTools } = await import('../src/tools/statleaders.js');
const { registerUtilityTools } = await import('../src/tools/utilities.js');

/**
 * Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
 * asserted against the served tool list — what a host actually sees.
 */
type Listed = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema: { properties?: Record<string, { enum?: unknown[] }> };
  _meta?: { mint?: Record<string, any> };
};

async function served(): Promise<Listed[]> {
  const h = await createTestHarness((s) => {
    for (const register of [
      registerSearchTools, registerSchoolTools, registerTeamTools, registerScheduleTools,
      registerRosterTools, registerStatsTools, registerAthleteTools, registerRankingsTools,
      registerStandingsTools, registerStatLeaderTools, registerUtilityTools,
    ]) register(s);
  });
  const { tools } = await h.client.listTools();
  await h.close?.();
  return tools as Listed[];
}

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];
const CANONICAL_INTENTS = ['whats-new', 'whats-due', 'whats-on'];

/** The intent every tool declares — this table is the assertion, so a new tool cannot skip the decision. */
const EXPECTED_INTENT: Record<string, string> = {
  maxpreps_search: 'lookup',
  maxpreps_get_school: 'lookup',
  maxpreps_list_teams: 'lookup',
  maxpreps_get_team: 'lookup',
  maxpreps_get_schedule: 'lookup',
  maxpreps_get_roster: 'lookup',
  maxpreps_get_stat_leaders: 'lookup',
  maxpreps_get_athlete: 'lookup',
  maxpreps_get_rankings: 'lookup',
  maxpreps_get_team_rankings: 'lookup',
  maxpreps_get_standings: 'lookup',
  maxpreps_list_stat_categories: 'lookup',
  maxpreps_get_stat_leaderboard: 'lookup',
  maxpreps_get_page: 'lookup',
};

describe('_meta.mint hints on tools/list', () => {
  it('every tool except the healthcheck is hinted, and the table names every served tool', async () => {
    const tools = await served();
    const names = tools.map((t) => t.name).filter((n) => !n.endsWith('_healthcheck'));
    expect(names.sort()).toEqual(Object.keys(EXPECTED_INTENT).sort());
    const health = tools.find((t) => t.name === 'maxpreps_healthcheck');
    expect(health).toBeDefined();
    expect(health?._meta?.mint).toBeUndefined();
  });

  it.each(Object.entries(EXPECTED_INTENT))('%s declares domain school and intent %s', async (name, intent) => {
    const mint = (await served()).find((t) => t.name === name)?._meta?.mint;
    expect(mint, name).toBeDefined();
    expect(mint!.domain).toBe('school');
    expect(mint!.intent).toBe(intent);
  });

  it('every hint is shaped per the host contract', async () => {
    for (const t of await served()) {
      const m = t._meta?.mint;
      if (!m) continue;
      expect(Object.keys(m).filter((k) => !KEYS.includes(k)), t.name).toEqual([]);
      expect(DOMAINS, t.name).toContain(m.domain);
      expect(INTENTS, t.name).toContain(m.intent);
      const props = t.inputSchema.properties ?? {};
      if ('subject' in m) expect(props, t.name).toHaveProperty(m.subject);
      if ('when' in m) {
        expect(Object.keys(m.when).sort(), t.name).toEqual(['end', 'start']);
        expect(props, t.name).toHaveProperty(m.when.start);
        expect(props, t.name).toHaveProperty(m.when.end);
      }
      if ('aliases' in m) {
        expect(m.aliases.length, t.name).toBeLessThanOrEqual(8);
        for (const a of m.aliases as string[]) {
          expect(a.length, t.name).toBeLessThanOrEqual(40);
          expect(a, t.name).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('canonical only on read-only whats-new/due/on reads, at most one per intent, each offering a brief view', async () => {
    const canonical = (await served()).filter((t) => t._meta?.mint?.canonical !== undefined);
    for (const t of canonical) {
      expect(t._meta!.mint!.canonical, t.name).toBe(true);
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(CANONICAL_INTENTS, t.name).toContain(t._meta!.mint!.intent);
      expect(t.inputSchema.properties?.view?.enum, t.name).toContain('brief');
    }
    for (const intent of CANONICAL_INTENTS) {
      expect(canonical.filter((t) => t._meta!.mint!.intent === intent).length, intent).toBeLessThanOrEqual(1);
    }
  });

  it('declares no canonical read and no subject: every read needs a school/team path, and there is no account to list subjects from', async () => {
    const tools = await served();
    expect(tools.filter((t) => t._meta?.mint?.canonical).map((t) => t.name)).toEqual([]);
    expect(tools.filter((t) => t._meta?.mint?.subject).map((t) => t.name)).toEqual([]);
  });

  it('carries the words a person says about games and teams', async () => {
    const tools = await served();
    const aliases = (name: string) => tools.find((t) => t.name === name)?._meta?.mint?.aliases ?? [];
    expect(aliases('maxpreps_get_schedule')).toEqual(expect.arrayContaining(['game', 'score']));
    expect(aliases('maxpreps_get_roster')).toEqual(expect.arrayContaining(['players']));
    expect(aliases('maxpreps_get_rankings')).toEqual(expect.arrayContaining(['ranked']));
  });
});

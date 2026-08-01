import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const page = vi.fn();
const healthcheck = vi.fn();
vi.mock('../src/client.js', () => ({ client: { page, healthcheck } }));

const { registerScheduleTools } = await import('../src/tools/schedule.js');
const { registerRosterTools } = await import('../src/tools/roster.js');
const { registerAthleteTools } = await import('../src/tools/athlete.js');
const { registerUtilityTools } = await import('../src/tools/utilities.js');
const { registerSearchTools } = await import('../src/tools/search.js');
const { registerSchoolTools } = await import('../src/tools/school.js');
const { createTestHarness } = await import('./helpers.js');
const { parseToolResult } = await import('@chrischall/mcp-utils/test');

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')).pageProps;

type Harness = Awaited<ReturnType<typeof createTestHarness>>;
let harness: Harness;

const call = async (name: string, args: Record<string, unknown> = {}) =>
  parseToolResult(await harness.callTool(name, args)) as Record<string, any>;

beforeEach(async () => {
  page.mockReset();
  healthcheck.mockReset();
  harness = await createTestHarness((s) => {
    registerScheduleTools(s);
    registerRosterTools(s);
    registerAthleteTools(s);
    registerUtilityTools(s);
    registerSearchTools(s);
    registerSchoolTools(s);
  });
});
afterEach(async () => {
  await harness.close();
});

describe('maxpreps_get_schedule', () => {
  beforeEach(() => page.mockResolvedValue(fixture('schedule-myers-park-fb-25-26.json')));

  it('requests the season segment before the tab', async () => {
    await call('maxpreps_get_schedule', { team: 'nc/x/y/football', season: '25-26' });
    expect(page).toHaveBeenCalledWith('nc/x/y/football/25-26/schedule');
  });

  it('computes the record from decoded scores', async () => {
    const r = await call('maxpreps_get_schedule', { team: 'nc/x/y/football' });
    expect(r.record).toEqual({ wins: 9, losses: 3, ties: 0, pointsFor: 412, pointsAgainst: 141 });
  });

  it('reports the record over all games even when filtered to upcoming', async () => {
    const r = await call('maxpreps_get_schedule', { team: 'nc/x/y/football', played: 'upcoming' });
    expect(r.record.wins).toBe(9);
    expect(r.games.every((g: any) => !g.hasResult)).toBe(true);
  });

  it('filters to completed games', async () => {
    const r = await call('maxpreps_get_schedule', { team: 'nc/x/y/football', played: 'completed' });
    expect(r.count).toBe(12);
    expect(r.games.every((g: any) => g.hasResult)).toBe(true);
  });

  it('notes an empty schedule instead of returning a bare zero', async () => {
    page.mockResolvedValue({ contests: [] });
    const r = await call('maxpreps_get_schedule', { team: 'nc/x/y/football' });
    expect(r.note).toMatch(/season may not have started/i);
  });

  it('rejects a malformed season before making a request', async () => {
    const raw = await harness.callTool('maxpreps_get_schedule', { team: 'nc/x/y/football', season: '2025-26' });
    expect(raw.isError).toBe(true);
    expect(page).not.toHaveBeenCalled();
  });
});

describe('maxpreps_get_roster', () => {
  beforeEach(() => page.mockResolvedValue(fixture('roster-myers-park-fb-25-26.json')));

  it('hides soft-deleted players by default', async () => {
    expect((await call('maxpreps_get_roster', { team: 'nc/x/y/football' })).count).toBe(63);
  });

  it('includes them on request', async () => {
    const r = await call('maxpreps_get_roster', { team: 'nc/x/y/football', includeDeleted: true });
    expect(r.count).toBe(87);
  });

  it('filters on a position', async () => {
    const r = await call('maxpreps_get_roster', { team: 'nc/x/y/football', position: 'QB' });
    expect(r.count).toBe(4);
    expect(r.players.every((p: any) => p.positions.split(', ').includes('QB'))).toBe(true);
  });

  it('matches a whole position, not a substring of one', async () => {
    // This fixture has two players listed at "SS" and nobody at plain "S", so a
    // substring implementation would wrongly return 2 here.
    const r = await call('maxpreps_get_roster', { team: 'nc/x/y/football', position: 'S' });
    expect(r.count).toBe(0);
    expect((await call('maxpreps_get_roster', { team: 'nc/x/y/football', position: 'SS' })).count).toBe(2);
  });
});

describe('maxpreps_get_athlete', () => {
  it('extracts careerid from a pasted URL', async () => {
    page.mockResolvedValue({ athleteName: 'Brody Keefe', careerContext: { a: 1 } });
    const r = await call('maxpreps_get_athlete', {
      athlete: 'https://www.maxpreps.com/nc/x/y/athletes/brody-keefe/?careerid=abc123',
    });
    expect(page).toHaveBeenCalledWith('nc/x/y/athletes/brody-keefe', { careerid: 'abc123' });
    expect(r.name).toBe('Brody Keefe');
  });

  it('refuses without a careerid rather than fetching a useless page', async () => {
    const raw = await harness.callTool('maxpreps_get_athlete', { athlete: 'nc/x/y/athletes/someone' });
    expect(raw.isError).toBe(true);
    expect(page).not.toHaveBeenCalled();
  });

  it('flags a stub career record instead of returning silent nulls', async () => {
    page.mockResolvedValue({});
    const r = await call('maxpreps_get_athlete', { athlete: 'nc/x/y/athletes/ghost?careerid=z' });
    expect(r.note).toMatch(/no published profile/i);
  });
});

describe('maxpreps_get_page', () => {
  it('summarises prop shape with keysOnly', async () => {
    page.mockResolvedValue({ contests: [1, 2], teamContext: {}, title: 'x', missing: null });
    const r = await call('maxpreps_get_page', { path: 'a/b', keysOnly: true });
    expect(r.keys).toEqual([
      { key: 'contests', type: 'array', length: 2 },
      { key: 'teamContext', type: 'object' },
      { key: 'title', type: 'string' },
      { key: 'missing', type: 'null' },
    ]);
  });

  it('passes a URL query through to the client', async () => {
    page.mockResolvedValue({ ok: true });
    await call('maxpreps_get_page', { path: 'https://www.maxpreps.com/a/b?careerid=q' });
    expect(page).toHaveBeenCalledWith('a/b', { careerid: 'q' });
  });

  it('rejects a non-MaxPreps host', async () => {
    const raw = await harness.callTool('maxpreps_get_page', { path: 'https://evil.example.com/a' });
    expect(raw.isError).toBe(true);
    expect(page).not.toHaveBeenCalled();
  });
});

describe('maxpreps_search', () => {
  it('caps each category at the limit and reports counts', async () => {
    page.mockResolvedValue(fixture('search-myers-park.json'));
    const r = await call('maxpreps_search', { query: 'myers park', limit: 2 });
    expect(page).toHaveBeenCalledWith('search', { q: 'myers park' });
    expect(r.schools.length).toBeLessThanOrEqual(2);
    expect(r.athletes.length).toBeLessThanOrEqual(2);
    expect(r.schoolCount).toBe(r.schools.length);
  });

  it('explains a zero-result search rather than returning bare empties', async () => {
    page.mockResolvedValue({ initialSchoolResults: null, initialCareerResults: null });
    const r = await call('maxpreps_search', { query: 'myers park high' });
    expect(r.note).toMatch(/literal|suffix/i);
  });
});

describe('maxpreps_list_teams', () => {
  const props = {
    teamMenuData: [
      { canonicalUrl: 'https://www.maxpreps.com/nc/x/y/football/', sport: 'Football', gender: 'Boys', teamLevel: 'Varsity' },
      { canonicalUrl: 'https://www.maxpreps.com/nc/x/y/football/jv/', sport: 'Football', gender: 'Boys', teamLevel: 'JV' },
      { canonicalUrl: 'https://www.maxpreps.com/nc/x/y/golf/girls/', sport: 'Golf', gender: 'Girls', teamLevel: 'Varsity' },
    ],
  };

  it('returns bare paths ready to feed the team tools', async () => {
    page.mockResolvedValue(props);
    const r = await call('maxpreps_list_teams', { school: 'nc/x/y' });
    expect(r.teams.map((t: any) => t.path)).toEqual(['nc/x/y/football', 'nc/x/y/football/jv', 'nc/x/y/golf/girls']);
  });

  it('filters by sport and by level', async () => {
    page.mockResolvedValue(props);
    expect((await call('maxpreps_list_teams', { school: 'nc/x/y', sport: 'golf' })).count).toBe(1);
    expect((await call('maxpreps_list_teams', { school: 'nc/x/y', level: 'jv' })).count).toBe(1);
  });

  it('notes when filters eliminate everything', async () => {
    page.mockResolvedValue(props);
    const r = await call('maxpreps_list_teams', { school: 'nc/x/y', sport: 'curling' });
    expect(r.note).toMatch(/no teams matched/i);
  });
});

describe('maxpreps_healthcheck', () => {
  it('surfaces a failed probe as data, not an error', async () => {
    healthcheck.mockResolvedValue({ ok: false, service: 'MaxPreps', error: 'unreachable' });
    const raw = await harness.callTool('maxpreps_healthcheck', {});
    expect(raw.isError).toBeFalsy();
    expect(parseToolResult(raw)).toMatchObject({ ok: false });
  });
});

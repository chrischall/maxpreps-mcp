import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const page = vi.fn();
vi.mock('../src/client.js', () => ({ client: { page } }));

const { registerRankingsTools } = await import('../src/tools/rankings.js');
const { registerStandingsTools } = await import('../src/tools/standings.js');
const { buildRankingsPath } = await import('../src/paths.js');
const { createTestHarness } = await import('./helpers.js');
const { parseToolResult } = await import('@chrischall/mcp-utils/test');

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')).pageProps;

let harness: Awaited<ReturnType<typeof createTestHarness>>;
const call = async (n: string, a: Record<string, unknown> = {}) =>
  parseToolResult(await harness.callTool(n, a)) as Record<string, any>;

beforeEach(async () => {
  page.mockReset();
  harness = await createTestHarness((s) => {
    registerRankingsTools(s);
    registerStandingsTools(s);
  });
});
afterEach(async () => {
  await harness.close();
});

describe('buildRankingsPath', () => {
  it('builds a national path when no state is given', () => {
    expect(buildRankingsPath({ sport: 'football', season: '25-26', pageNumber: 1 })).toBe(
      'football/25-26/rankings/1',
    );
  });

  it('prefixes the state when given, lowercased', () => {
    expect(buildRankingsPath({ sport: 'football', state: 'NC', season: '25-26', pageNumber: 2 })).toBe(
      'nc/football/25-26/rankings/2',
    );
  });

  it('omits the season segment for the current season', () => {
    expect(buildRankingsPath({ sport: 'basketball', state: 'ca', pageNumber: 1 })).toBe(
      'ca/basketball/rankings/1',
    );
  });

  // The page segment is not optional upstream — dropping it 404s.
  it('always emits a page segment', () => {
    expect(buildRankingsPath({ sport: 'football', pageNumber: 1 })).toMatch(/\/rankings\/1$/);
  });

  it.each([
    [{ sport: 'football', state: 'north carolina', pageNumber: 1 }, /state/i],
    [{ sport: 'foot ball', pageNumber: 1 }, /sport/i],
    [{ sport: 'football', season: '2025', pageNumber: 1 }, /season/i],
    [{ sport: 'football', pageNumber: 0 }, /page/i],
  ])('rejects %o', (args, re) => {
    expect(() => buildRankingsPath(args as any)).toThrow(re);
  });
});

describe('maxpreps_get_rankings', () => {
  beforeEach(() => page.mockResolvedValue(fixture('rankings-nc-football-25-26.json')));

  it('returns a ranked list with pagination context', async () => {
    const r = await call('maxpreps_get_rankings', { sport: 'football', state: 'NC', season: '25-26' });
    expect(page).toHaveBeenCalledWith('nc/football/25-26/rankings/1');
    expect(r.totalCount).toBe(415);
    expect(r.teams[0]).toMatchObject({ rank: 1, schoolName: 'Grimsley', overall: '15-0' });
    expect(r.hasMore).toBe(true);
  });

  it('exposes a team path that the team tools accept', async () => {
    const r = await call('maxpreps_get_rankings', { sport: 'football', state: 'NC', season: '25-26' });
    // teamLink is a full schedule URL; callers need the bare team path.
    expect(r.teams[0].teamPath).toBe('nc/greensboro/grimsley-whirlies/football');
  });

  it('notes an out-of-season leaderboard rather than implying no teams exist', async () => {
    page.mockResolvedValue({ rankingsListData: { totalCount: 0, rankings: [], year: '26-27' } });
    const r = await call('maxpreps_get_rankings', { sport: 'football', state: 'NC' });
    expect(r.note).toMatch(/season/i);
  });
});

describe('maxpreps_get_team_rankings', () => {
  beforeEach(() => page.mockResolvedValue(fixture('team-rankings-myers-park-fb-25-26.json')));

  it('summarises the team rank in every published context', async () => {
    const r = await call('maxpreps_get_team_rankings', {
      team: 'nc/charlotte/myers-park-mustangs/football',
      season: '25-26',
    });
    expect(page).toHaveBeenCalledWith('nc/charlotte/myers-park-mustangs/football/25-26/rankings');
    expect(r.contexts.map((c: any) => c.contextName)).toEqual([
      'National',
      'North Carolina',
      'North Carolina Division 8A',
      'Charlotte',
    ]);
    expect(r.contexts[0].nearby.length).toBeGreaterThan(0);
  });
});

describe('maxpreps_get_standings', () => {
  beforeEach(() => page.mockResolvedValue(fixture('standings-myers-park-fb-25-26.json')));

  it('returns the conference table with each team row', async () => {
    const r = await call('maxpreps_get_standings', {
      team: 'nc/charlotte/myers-park-mustangs/football',
      season: '25-26',
    });
    expect(page).toHaveBeenCalledWith('nc/charlotte/myers-park-mustangs/football/25-26/standings');
    expect(r.sections.length).toBeGreaterThan(0);
    const row = r.sections[0].teams[0];
    expect(row).toHaveProperty('schoolName');
    expect(row).toHaveProperty('conferenceWinLossTies');
    expect(row).toHaveProperty('overallWinLossTies');
  });

  it('includes ranked stat leaders when the season publishes them', async () => {
    const r = await call('maxpreps_get_standings', {
      team: 'nc/charlotte/myers-park-mustangs/football',
      season: '25-26',
    });
    expect(r.leaderStats.map((s: any) => s.statName)).toContain('Passing Yards');
  });

  it('notes an empty standings page instead of returning bare empties', async () => {
    page.mockResolvedValue({ standingsData: { standingSections: [] }, leaderStats: [] });
    const r = await call('maxpreps_get_standings', { team: 'nc/x/y/football' });
    expect(r.note).toMatch(/no standings/i);
  });
});

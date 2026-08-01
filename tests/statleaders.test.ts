import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeStatLeaders } from '../src/decode.js';

const page = vi.fn();
vi.mock('../src/client.js', () => ({ client: { page } }));

const { registerStatLeaderTools } = await import('../src/tools/statleaders.js');
const { createTestHarness } = await import('./helpers.js');
const { parseToolResult } = await import('@chrischall/mcp-utils/test');

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')).pageProps;
const board = fixture('stat-leaderboard-nc-passing-yds.json');
const cats = fixture('stat-categories-nc-football-25-26.json');

let harness: Awaited<ReturnType<typeof createTestHarness>>;
const call = async (n: string, a: Record<string, unknown> = {}) =>
  parseToolResult(await harness.callTool(n, a)) as Record<string, any>;

beforeEach(async () => {
  page.mockReset();
  harness = await createTestHarness(registerStatLeaderTools);
});
afterEach(async () => {
  await harness.close();
});

describe('decodeStatLeaders', () => {
  const table = decodeStatLeaders(board.statLeadersListData);

  it('names stat values from the payload’s own columns', () => {
    expect(table.leaders[0].stats).toMatchObject({
      'Passing Yards': '4424',
      'Games Played': '16',
    });
  });

  // The tuple was derived empirically, so the properties that pinned it are the
  // regression test. Index 5/6 in particular are easy to get backwards.
  it('reads index 5 as city and index 6 as school, not the reverse', () => {
    const mismatched = table.leaders.filter((l) => {
      const seg = (l.teamPath ?? '').split('/'); // <st>/<city>/<school-slug>/<sport>
      const slug = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return seg.length >= 3 && slug(l.city) !== seg[1];
    });
    // Allow a rare mailing-city mismatch but the overwhelming majority must line up.
    expect(mismatched.length / table.leaders.length).toBeLessThan(0.1);
    const wrongWayRound = table.leaders.filter((l) => {
      const seg = (l.teamPath ?? '').split('/');
      const slug = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return seg.length >= 3 && slug(l.schoolName) === seg[1] && slug(l.city) !== seg[1];
    });
    expect(wrongWayRound).toEqual([]);
  });

  it('keeps rank equal to row order', () => {
    expect(table.leaders.map((l) => l.rank)).toEqual(table.leaders.map((_, i) => i + 1));
  });

  it('strips the team URL down to a plain team path', () => {
    expect(table.leaders[0].teamPath).toMatch(/^[a-z]{2}\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/);
    expect(table.leaders[0].teamPath).not.toMatch(/schedule|\d{2}-\d{2}/);
  });

  it('degrades to raw rows instead of mislabelling a changed shape', () => {
    const drifted = decodeStatLeaders({
      columns: board.statLeadersListData.columns,
      rows: [['too', 'few', 'fields']],
    });
    expect(drifted.decodeWarning).toMatch(/row shape/i);
    expect(drifted.rawRows).toHaveLength(1);
    expect(drifted.leaders).toEqual([]);
  });

  it('handles an empty table', () => {
    expect(decodeStatLeaders({ columns: [], rows: [] }).leaders).toEqual([]);
  });
});

describe('maxpreps_list_stat_categories', () => {
  beforeEach(() => page.mockResolvedValue(cats));

  it('builds the index path from sport, state and season', async () => {
    await call('maxpreps_list_stat_categories', { sport: 'football', state: 'NC', season: '25-26' });
    expect(page).toHaveBeenCalledWith('nc/football/25-26/stat-leaders');
  });

  it('goes national when no state is given', async () => {
    await call('maxpreps_list_stat_categories', { sport: 'football', season: '25-26' });
    expect(page).toHaveBeenCalledWith('football/25-26/stat-leaders');
  });

  it.each(['..', '?x', './', '%2e'])('rejects a bogus two-char state %s without fetching', async (bad) => {
    const raw = await harness.callTool('maxpreps_list_stat_categories', { sport: 'football', state: bad });
    expect(raw.isError).toBe(true);
    expect(page).not.toHaveBeenCalled();
  });

  it('returns a ready-to-use leaderboard path per category', async () => {
    const r = await call('maxpreps_list_stat_categories', { sport: 'football', state: 'NC', season: '25-26' });
    expect(r.count).toBeGreaterThan(0);
    // Not derivable from the header — this is exactly why the index exists.
    const totalTds = r.categories.find((c: any) => c.statName === 'Total TDs');
    expect(totalTds.path).toBe('nc/football/25-26/stat-leaders/offense/touchdowns/tot-tds');
    expect(totalTds.path).not.toMatch(/^https?:/);
  });
});

describe('maxpreps_get_stat_leaderboard', () => {
  beforeEach(() => page.mockResolvedValue(board));

  it('returns decoded leaders capped at the limit', async () => {
    const r = await call('maxpreps_get_stat_leaderboard', {
      path: 'nc/football/25-26/stat-leaders/offense/passing/yds',
      limit: 3,
    });
    expect(r.leaders).toHaveLength(3);
    expect(r.leaders[0]).toMatchObject({ rank: 1, name: 'Tyler Jones', schoolName: 'Kinston' });
  });

  it('accepts a full URL as the path', async () => {
    await call('maxpreps_get_stat_leaderboard', {
      path: 'https://www.maxpreps.com/nc/football/25-26/stat-leaders/offense/passing/yds/',
    });
    expect(page).toHaveBeenCalledWith('nc/football/25-26/stat-leaders/offense/passing/yds', {});
  });

  it('surfaces the warning and raw rows when the shape drifts', async () => {
    page.mockResolvedValue({ statLeadersListData: { columns: board.statLeadersListData.columns, rows: [[1, 2]] } });
    const r = await call('maxpreps_get_stat_leaderboard', { path: 'nc/football/25-26/stat-leaders/x/y/z' });
    expect(r.warning).toMatch(/row shape/i);
    expect(r.rawRows).toBeTruthy();
  });
});

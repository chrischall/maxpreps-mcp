import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deserializeObject,
  deserializeArray,
  decodeRoster,
  decodeSchedule,
  ROSTER_KEYS,
  CONTEST_KEYS,
  TEAM_KEYS,
} from '../src/decode.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')).pageProps;

const mpRoster = load('roster-myers-park-fb-25-26.json');
const mpSchedule = load('schedule-myers-park-fb-25-26.json');
const mdSchedule = load('schedule-mater-dei-bb-25-26.json');

describe('deserializeObject', () => {
  it('maps a positional row onto its key list', () => {
    expect(deserializeObject(['a', 'b', 'c'], [1, 2, 3])).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('lets a later duplicate key win, exactly as the site does', () => {
    // The site's TEAM_KEYS repeats `teamId`; its own deserializer assigns in
    // order, so the last occurrence is the surviving value.
    expect(deserializeObject(['id', 'id'], ['first', 'second'])).toEqual({ id: 'second' });
  });

  it('fills missing trailing fields with undefined rather than truncating', () => {
    expect(deserializeObject(['a', 'b'], [1])).toEqual({ a: 1, b: undefined });
  });

  it('passes through null and already-hydrated objects', () => {
    expect(deserializeObject(['a'], null)).toBeNull();
    const obj = { a: 1 };
    expect(deserializeObject(['a'], obj)).toBe(obj);
  });

  it('returns [] for a non-array input to deserializeArray', () => {
    expect(deserializeArray(['a'], undefined)).toEqual([]);
  });
});

describe('key lists match the site bundle', () => {
  it('has the expected field counts', () => {
    expect(ROSTER_KEYS).toHaveLength(37);
    expect(CONTEST_KEYS).toHaveLength(41);
    expect(TEAM_KEYS).toHaveLength(32);
  });

  it('matches the arity of real payload rows', () => {
    expect(mpRoster.athleteData[0]).toHaveLength(ROSTER_KEYS.length);
    expect(mpSchedule.contests[0]).toHaveLength(CONTEST_KEYS.length);
    const contest = deserializeObject(CONTEST_KEYS, mpSchedule.contests[0]) as Record<string, unknown>;
    expect(contest.currentTeam).toHaveLength(TEAM_KEYS.length);
  });
});

describe('decodeRoster', () => {
  it('drops soft-deleted rows by default, matching what the site renders', () => {
    // The live page rendered exactly 63 of these 87 rows when captured.
    expect(mpRoster.athleteData).toHaveLength(87);
    expect(decodeRoster(mpRoster)).toHaveLength(63);
    expect(decodeRoster(mpRoster, { includeDeleted: true })).toHaveLength(87);
  });

  it('decodes a known player exactly as the page displays them', () => {
    const chaz = decodeRoster(mpRoster).find((p) => p.name === 'Chaz Portis');
    expect(chaz).toMatchObject({
      jersey: '1',
      firstName: 'Chaz',
      lastName: 'Portis',
      classYear: 12,
      classYearLabel: 'Sr.',
      positions: 'WR',
      height: `5'10"`,
      weight: 150,
    });
  });

  it('sorts by jersey number, not lexically', () => {
    const jerseys = decodeRoster(mpRoster).map((p) => Number(p.jersey));
    expect(jerseys).toEqual([...jerseys].sort((a, b) => a - b));
  });

  it('leaves height null when the school published no measurements', () => {
    const all = decodeRoster(mpRoster, { includeDeleted: true });
    const unmeasured = all.find((p) => p.heightFeet === null);
    expect(unmeasured?.height).toBeNull();
  });
});

describe('decodeSchedule', () => {
  it('drops soft-deleted contests by default', () => {
    expect(mpSchedule.contests).toHaveLength(14);
    expect(decodeSchedule(mpSchedule)).toHaveLength(12);
    expect(decodeSchedule(mpSchedule, { includeDeleted: true })).toHaveLength(14);
  });

  it('orients scores as team-vs-opponent, not winner-first', () => {
    const loss = decodeSchedule(mpSchedule).find((g) => g.opponent?.startsWith('Mallard Creek'));
    // The site renders this as "L 20-13" (winner first); ours must not.
    expect(loss).toMatchObject({ result: 'L', teamScore: 13, opponentScore: 20 });
    expect(loss?.resultString).toBe('L 20-13');
  });

  it('maps homeAwayType 0/1 to home/away', () => {
    const games = decodeSchedule(mpSchedule);
    expect(games.find((g) => g.opponent?.startsWith('Jay M. Robinson'))?.homeAway).toBe('away');
    expect(games.find((g) => g.opponent?.startsWith('Providence'))?.homeAway).toBe('home');
  });

  // The strongest guard against a silently-shifted key map: totals derived from
  // the decoded per-game scores must equal the site's own season standings.
  it.each([
    ['Myers Park football 25-26', () => mpSchedule, { w: 9, l: 3, pf: 412, pa: 141 }],
    ['Mater Dei basketball 25-26', () => mdSchedule, { w: 22, l: 16, pf: 2874, pa: 2592 }],
  ])('reproduces the published season totals for %s', (_label, get, expected) => {
    const games = decodeSchedule(get());
    const played = games.filter((g) => g.hasResult);
    expect({
      w: played.filter((g) => g.result === 'W').length,
      l: played.filter((g) => g.result === 'L').length,
      pf: played.reduce((n, g) => n + (g.teamScore ?? 0), 0),
      pa: played.reduce((n, g) => n + (g.opponentScore ?? 0), 0),
    }).toEqual(expected);
  });

  it('returns [] when the payload has no contests array', () => {
    expect(decodeSchedule({})).toEqual([]);
  });
});

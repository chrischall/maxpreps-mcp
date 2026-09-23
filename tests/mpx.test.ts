import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The shipped skill's standalone CLI (skills/maxpreps/scripts/mpx.mjs) keeps
// its own copy of the decoders. Drive it through its stdin mode so no network
// is touched.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MPX = join(ROOT, 'skills/maxpreps/scripts/mpx.mjs');
const FIXTURE = join(ROOT, 'tests/fixtures/schedule-myers-park-fb-25-26.json');

const CURRENT_TEAM = 37; // CONTEST_KEYS index of currentTeam
const HOME_AWAY_TYPE = 11; // TEAM_KEYS index of homeAwayType

function homeAwayFor(raw: unknown): string {
  const payload = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const contest = payload.pageProps.contests[0];
  contest[CURRENT_TEAM][HOME_AWAY_TYPE] = raw;
  payload.pageProps.contests = [contest];
  const out = execFileSync(process.execPath, [MPX, 'schedule', '--all'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return JSON.parse(out)[0].homeAway;
}

describe('mpx.mjs schedule homeAway', () => {
  // Must agree with src/decode.ts decodeHomeAway: only the numbers 0/1/2 map.
  it.each([
    [0, 'home'],
    [1, 'away'],
    [2, 'neutral'],
    [3, 'unknown'],
    [null, 'unknown'],
    ['0', 'unknown'],
    ['2', 'unknown'],
  ])("homeAwayType %j is '%s'", (raw, expected) => {
    expect(homeAwayFor(raw)).toBe(expected);
  });
});

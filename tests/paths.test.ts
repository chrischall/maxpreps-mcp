import { describe, it, expect } from 'vitest';
import { parseSiteUrl, buildTeamPath, SEASON_RE } from '../src/paths.js';

describe('parseSiteUrl', () => {
  it('accepts a bare path', () => {
    expect(parseSiteUrl('nc/charlotte/myers-park-mustangs')).toEqual({
      path: 'nc/charlotte/myers-park-mustangs',
      query: {},
    });
  });

  it('strips the origin, slashes and trailing slash from a full URL', () => {
    expect(parseSiteUrl('https://www.maxpreps.com/nc/charlotte/myers-park-mustangs/football/')).toEqual({
      path: 'nc/charlotte/myers-park-mustangs/football',
      query: {},
    });
  });

  it('splits the query so an athlete careerid survives a pasted URL', () => {
    expect(
      parseSiteUrl(
        'https://www.maxpreps.com/nc/charlotte/myers-park-mustangs/athletes/brody-keefe/?careerid=c35dcsgih39sc',
      ),
    ).toEqual({
      path: 'nc/charlotte/myers-park-mustangs/athletes/brody-keefe',
      query: { careerid: 'c35dcsgih39sc' },
    });
  });

  it('accepts the bare-host and m. variants', () => {
    expect(parseSiteUrl('http://maxpreps.com/a/b').path).toBe('a/b');
    expect(parseSiteUrl('https://m.maxpreps.com/a/b').path).toBe('a/b');
  });

  it.each([
    ['a/../../etc/passwd', /traversal|\.\./i],
    ['https://evil.example.com/a/b', /maxpreps/i],
    ['', /empty|path/i],
    ['/', /empty|path/i],
    ['a b/c', /invalid|character/i],
  ])('rejects %s', (input, re) => {
    expect(() => parseSiteUrl(input)).toThrow(re);
  });

  it('does not treat a legitimate hyphenated segment as traversal', () => {
    expect(parseSiteUrl('ca/santa-ana/mater-dei-monarchs/basketball/25-26/roster').path).toBe(
      'ca/santa-ana/mater-dei-monarchs/basketball/25-26/roster',
    );
  });
});

describe('buildTeamPath', () => {
  const team = 'nc/charlotte/myers-park-mustangs/football';

  it('returns the team home path when given no tab', () => {
    expect(buildTeamPath(team)).toBe(team);
  });

  it('appends a tab', () => {
    expect(buildTeamPath(team, 'schedule')).toBe(`${team}/schedule`);
  });

  it('inserts the season before the tab, not after', () => {
    expect(buildTeamPath(team, 'schedule', '25-26')).toBe(`${team}/25-26/schedule`);
  });

  it('keeps gender and level segments ahead of the season', () => {
    expect(buildTeamPath('nc/x/y/basketball/girls/jv', 'roster', '25-26')).toBe(
      'nc/x/y/basketball/girls/jv/25-26/roster',
    );
  });

  it('tolerates a team path that already carries a tab or season', () => {
    expect(buildTeamPath(`${team}/schedule`, 'roster', '25-26')).toBe(`${team}/25-26/roster`);
    expect(buildTeamPath(`${team}/24-25/schedule`, 'roster', '25-26')).toBe(`${team}/25-26/roster`);
  });

  it('rejects a malformed season', () => {
    expect(() => buildTeamPath(team, 'schedule', '2025')).toThrow(/season/i);
  });

  it('matches real season labels', () => {
    expect(SEASON_RE.test('25-26')).toBe(true);
    expect(SEASON_RE.test('09-10')).toBe(true);
    expect(SEASON_RE.test('2025-26')).toBe(false);
  });
});

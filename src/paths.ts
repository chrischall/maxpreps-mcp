import { createHelpfulError } from '@chrischall/mcp-utils';

/** MaxPreps labels a season `<yy>-<yy>`, e.g. `25-26`. */
export const SEASON_RE = /^\d{2}-\d{2}$/;

/** Tabs that hang off a team path. */
export const TEAM_TABS = ['schedule', 'roster', 'stats', 'rankings', 'standings'] as const;
export type TeamTab = (typeof TEAM_TABS)[number];

const ALLOWED_HOSTS = new Set(['maxpreps.com', 'www.maxpreps.com', 'm.maxpreps.com']);
// Path segments on this site are lowercase slugs, digits, hyphens, dots and
// underscores. Anything else (whitespace, %, backslash) is a caller mistake.
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export interface ParsedSiteUrl {
  path: string;
  query: Record<string, string>;
}

/**
 * Normalise a user-supplied location into a bare site path plus its query.
 *
 * Accepts a full maxpreps.com URL (people paste those), a rooted path, or a bare
 * path. The query is returned separately because some routes carry a required
 * parameter — an athlete page is meaningless without its `careerid`.
 */
export function parseSiteUrl(input: string): ParsedSiteUrl {
  const raw = String(input ?? '').trim();
  if (!raw) throw createHelpfulError('Empty MaxPreps path.', { hint: 'Pass a path like nc/charlotte/myers-park-mustangs, or a maxpreps.com URL.' });

  let pathPart = raw;
  const query: Record<string, string> = {};

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw createHelpfulError(`Could not parse "${raw}" as a URL.`, { hint: 'Pass a maxpreps.com URL or a bare site path.' });
    }
    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
      throw createHelpfulError(`"${url.hostname}" is not a MaxPreps host.`, {
        hint: 'This server only reads maxpreps.com. Pass a maxpreps.com URL or a bare site path.',
      });
    }
    pathPart = url.pathname;
    for (const [k, v] of url.searchParams) query[k] = v;
  } else {
    const q = raw.indexOf('?');
    if (q !== -1) {
      pathPart = raw.slice(0, q);
      for (const [k, v] of new URLSearchParams(raw.slice(q + 1))) query[k] = v;
    }
  }

  const path = pathPart.replace(/^\/+|\/+$/g, '');
  if (!path) throw createHelpfulError('Empty MaxPreps path.', { hint: 'Pass a path like nc/charlotte/myers-park-mustangs, or a maxpreps.com URL.' });

  const segments = path.split('/');
  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      throw createHelpfulError(`Path traversal is not allowed in "${path}".`, { hint: 'Pass a plain site path with no "." or ".." segments.' });
    }
    if (!SEGMENT_RE.test(seg)) {
      throw createHelpfulError(`Invalid character in path segment "${seg}".`, {
        hint: 'Segments may contain letters, digits, dots, hyphens and underscores only.',
      });
    }
  }
  return { path, query };
}

const SPORT_RE = /^[a-z0-9-]+$/;
const STATE_RE = /^[A-Za-z]{2}$/;

export interface RankingsPathArgs {
  sport: string;
  /** Two-letter state code. Omit for national rankings. */
  state?: string;
  /** Season label. Omit for the current season. */
  season?: string;
  pageNumber: number;
}

/**
 * Validate the sport / state / season segments shared by the leaderboard paths.
 *
 * Every one of these is interpolated straight into a fetched URL, so a
 * length-only check is not enough: a two-character `state` of `..` would climb a
 * path segment. Each segment is matched against its own pattern instead.
 */
function validateScope(sport: string, state?: string, season?: string): string {
  const slug = String(sport ?? '').toLowerCase().trim();
  if (!SPORT_RE.test(slug)) {
    throw createHelpfulError(`"${sport}" is not a sport slug.`, {
      hint: 'Use the lowercase hyphenated slug MaxPreps uses in URLs, e.g. football, basketball, cross-country. maxpreps_list_teams shows the slugs a school uses.',
    });
  }
  if (state !== undefined && !STATE_RE.test(state)) {
    throw createHelpfulError(`"${state}" is not a two-letter state code.`, {
      hint: 'Use a postal abbreviation like NC or CA, or omit it for national scope.',
    });
  }
  if (season !== undefined && !SEASON_RE.test(season)) {
    throw createHelpfulError(`"${season}" is not a MaxPreps season label.`, {
      hint: 'Use the two-digit form, e.g. 25-26, or omit it for the current season.',
    });
  }
  return slug;
}

/** `[<state>/]<sport>[/<season>]/stat-leaders` — the stat category index. */
export function buildStatLeadersIndexPath(sport: string, state?: string, season?: string): string {
  const slug = validateScope(sport, state, season);
  return [state?.toLowerCase(), slug, season, 'stat-leaders'].filter(Boolean).join('/');
}

/**
 * Compose a rankings leaderboard path.
 *
 * Grammar is `[<state>/]<sport>[/<season>]/rankings/<page>`. The trailing page
 * segment is **not optional** upstream — omitting it 404s.
 */
export function buildRankingsPath({ sport, state, season, pageNumber }: RankingsPathArgs): string {
  const slug = validateScope(sport, state, season);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw createHelpfulError(`Rankings page must be a positive integer, got ${pageNumber}.`, {
      hint: 'Pages are 1-based and return 25 teams each.',
    });
  }
  const parts = [
    ...(state ? [state.toLowerCase()] : []),
    slug,
    ...(season ? [season] : []),
    'rankings',
    String(pageNumber),
  ];
  return parts.join('/');
}

/**
 * Compose a team path with an optional tab and season.
 *
 * The season is a segment that sits **between** the team and the tab
 * (`.../football/25-26/schedule`), so any tab or season already present on the
 * supplied path is stripped before recomposing. Gender and level segments
 * (`/girls`, `/jv`) are part of the team path and are preserved.
 */
export function buildTeamPath(teamPath: string, tab?: TeamTab, season?: string): string {
  if (season !== undefined && !SEASON_RE.test(season)) {
    throw createHelpfulError(`"${season}" is not a MaxPreps season label.`, {
      hint: 'Use the two-digit form, e.g. 25-26. maxpreps_get_team lists the seasons a team has.',
    });
  }
  const { path } = parseSiteUrl(teamPath);
  const parts = path.split('/');
  // Drop a trailing tab, then a trailing season, so callers can pass a URL
  // copied from any team subpage.
  if (parts.length > 0 && (TEAM_TABS as readonly string[]).includes(parts[parts.length - 1])) parts.pop();
  if (parts.length > 0 && SEASON_RE.test(parts[parts.length - 1])) parts.pop();

  const base = parts.join('/');
  const withSeason = season ? `${base}/${season}` : base;
  return tab ? `${withSeason}/${tab}` : withSeason;
}

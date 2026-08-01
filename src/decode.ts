/**
 * MaxPreps ships its roster and schedule payloads as bare positional arrays with
 * the field names stripped, then rehydrates them client-side. The three key lists
 * below are lifted verbatim from the site's own JS bundle:
 *
 *   - ROSTER_KEYS   `GSSP_ROSTER_SERIALIZE_KEYS`
 *   - CONTEST_KEYS  the contest list in `deserializeContestList`
 *   - TEAM_KEYS     the per-team list in the same module
 *
 * See docs/MAXPREPS-API.md for how to re-derive them if the site changes.
 */

/** A positional row as it arrives on the wire. */
type Row = unknown[];

export const ROSTER_KEYS = [
  'linkedAthlete', 'linkedParents', 'canStartChat', 'accountInformation', 'athleteId',
  'firstName', 'lastName', 'classYear', 'jersey', 'heightInches', 'heightFeet', 'weight',
  'position1', 'position2', 'position3', 'hasStats', 'isCaptain', 'isDeleted', 'photoUrl',
  'secondaryPhotoUrl', 'weightClass', 'isPlayerOfTheGame', 'isFemale', 'bio', 'hasPhoto',
  'rosterId', 'schoolId', 'sportSeasonId', 'sportSeasonName', 'careerProfileId', 'createdOn',
  'canonicalUrl', 'formattedPositions', 'formattedName', 'formattedHeight', 'calculatedHeight',
  'formattedClassYear',
] as const;

export const CONTEST_KEYS = [
  'teams', 'contestId', 'createdOn', 'isDeleted', 'hasResult', 'location', 'details', 'state',
  'city', 'name', 'dateCode', 'date', 'tournamentBracketId', 'tournamentId', 'sportSeasonId',
  'contestState', 'allowEditContestResults', 'hasContestPage', 'canonicalUrl', 'isDateTba',
  'isTimeTba', 'contestAlias', 'isLiveGameInProgress', 'overtimePeriodsPlayed',
  'overtimeShortAlias', 'currentLivePeriod', 'currentScorerUserId', 'rolesWhoCanEnterScores',
  'reasonWhyCannotEnterScores', 'description', 'isLiveScoringEnabled', 'isGameChangerConnected',
  'hasGameChangerImportedStats', 'bracketGameIndex', 'bracketGamesInMatchup', 'goFanUrl',
  'nfhsStreamUrl', 'currentTeam', 'opponentTeam', 'bracketMatchupId', 'bracketIsPublished',
] as const;

// `teamId`, `sportSeasonId` and `resultString` each appear more than once. That is
// faithful to the site: its deserializer assigns in order, so the last occurrence
// wins. The repeated values are identical in every payload observed, so the
// collapse loses nothing — but the duplicates must stay to keep the indices aligned.
export const TEAM_KEYS = [
  'id', 'teamId', 'sportSeasonId', 'resultString', 'index', 'result', 'score', 'isTeamTBA',
  'isForfeit', 'isDeleted', 'hasStats', 'homeAwayType', 'contestType', 'teamCanonicalUrl',
  'name', 'city', 'state', 'address', 'zipCode', 'formattedName', 'mascotUrl', 'mascot',
  'color1', 'color2', 'schoolNameAcronym', 'teamId', 'contestId', 'sportSeasonId', 'teamId',
  'calculatedTeamContestResult', 'currentLiveScore', 'resultString',
] as const;

const CLASS_YEAR_LABEL: Record<number, string> = { 9: 'Fr.', 10: 'So.', 11: 'Jr.', 12: 'Sr.' };

/** `0` = home, `1` = away (verified against the site's vs/@ rendering). */
const HOME = 0;

/**
 * Rehydrate one positional row. Mirrors the site's own `deserializeObject`,
 * including duplicate-key overwrite semantics. A `null` row stays null and an
 * already-hydrated object passes through untouched, so this is safe to apply
 * twice or to a payload the site decided not to compress.
 */
export function deserializeObject(keys: readonly string[], row: unknown): unknown {
  if (row === null || row === undefined) return null;
  if (!Array.isArray(row)) return row;
  const out: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) out[keys[i]] = (row as Row)[i];
  return out;
}

export function deserializeArray(keys: readonly string[], rows: unknown): unknown[] {
  return Array.isArray(rows) ? rows.map((r) => deserializeObject(keys, r)) : [];
}

export interface RosterPlayer {
  athleteId: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  jersey: string | null;
  positions: string;
  classYear: number | null;
  classYearLabel: string | null;
  height: string | null;
  heightFeet: number | null;
  heightInches: number | null;
  weight: number | null;
  isCaptain: boolean;
  isDeleted: boolean;
  hasStats: boolean;
  canonicalUrl: string | null;
  careerProfileId: string | null;
}

export interface Game {
  date: string | null;
  opponent: string | null;
  opponentUrl: string | null;
  homeAway: 'home' | 'away';
  result: string | null;
  teamScore: number | null;
  opponentScore: number | null;
  /** Winner-first, as the site displays it (a loss reads "L 20-13"). */
  resultString: string | null;
  hasResult: boolean;
  isDeleted: boolean;
  contestAlias: string | null;
  details: string | null;
  location: string | null;
  isDateTba: boolean;
  isTimeTba: boolean;
  canonicalUrl: string | null;
  contestId: string | null;
  ticketsUrl: string | null;
  streamUrl: string | null;
}

export interface DecodeOptions {
  /** Keep soft-deleted rows, which the site itself hides. Default `false`. */
  includeDeleted?: boolean;
}

type Props = Record<string, unknown>;
const asRecord = (v: unknown): Props => (v && typeof v === 'object' ? (v as Props) : {});
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Decode `pageProps.athleteData` from a team roster page. */
export function decodeRoster(pageProps: Props, opts: DecodeOptions = {}): RosterPlayer[] {
  return deserializeArray(ROSTER_KEYS, pageProps.athleteData)
    .map((r) => {
      const a = asRecord(r);
      const feet = num(a.heightFeet);
      const inches = num(a.heightInches);
      const classYear = num(a.classYear);
      return {
        athleteId: str(a.athleteId),
        name: [str(a.firstName), str(a.lastName)].filter(Boolean).join(' '),
        firstName: str(a.firstName),
        lastName: str(a.lastName),
        jersey: str(a.jersey),
        positions: [a.position1, a.position2, a.position3]
          .filter((p): p is string => typeof p === 'string' && p.length > 0)
          .join(', '),
        classYear,
        classYearLabel: classYear !== null ? (CLASS_YEAR_LABEL[classYear] ?? null) : null,
        // The payload's own `formattedHeight` is empty, so derive it.
        height: feet !== null && inches !== null ? `${feet}'${inches}"` : null,
        heightFeet: feet,
        heightInches: inches,
        weight: num(a.weight),
        isCaptain: a.isCaptain === true,
        isDeleted: a.isDeleted === true,
        hasStats: a.hasStats === true,
        canonicalUrl: str(a.canonicalUrl),
        careerProfileId: str(a.careerProfileId),
      };
    })
    .filter((p) => opts.includeDeleted || !p.isDeleted)
    .sort((a, b) => (Number(a.jersey) || Number.MAX_SAFE_INTEGER) - (Number(b.jersey) || Number.MAX_SAFE_INTEGER));
}

/** Decode `pageProps.contests` from a team schedule page. */
export function decodeSchedule(pageProps: Props, opts: DecodeOptions = {}): Game[] {
  const rows = Array.isArray(pageProps.contests) ? pageProps.contests : [];
  return rows
    .map((row) => {
      const c = asRecord(deserializeObject(CONTEST_KEYS, row));
      const mine = asRecord(deserializeObject(TEAM_KEYS, c.currentTeam));
      const theirs = asRecord(deserializeObject(TEAM_KEYS, c.opponentTeam));
      return {
        date: str(c.date),
        opponent: str(theirs.formattedName),
        opponentUrl: str(theirs.teamCanonicalUrl),
        homeAway: (mine.homeAwayType === HOME ? 'home' : 'away') as 'home' | 'away',
        result: str(mine.result),
        teamScore: num(mine.score),
        opponentScore: num(theirs.score),
        resultString: str(mine.resultString),
        hasResult: c.hasResult === true,
        isDeleted: c.isDeleted === true,
        contestAlias: str(c.contestAlias),
        details: str(c.details),
        location: str(c.location),
        isDateTba: c.isDateTba === true,
        isTimeTba: c.isTimeTba === true,
        canonicalUrl: str(c.canonicalUrl),
        contestId: str(c.contestId),
        ticketsUrl: str(c.goFanUrl),
        streamUrl: str(c.nfhsStreamUrl),
      };
    })
    .filter((g) => opts.includeDeleted || !g.isDeleted);
}

// --- stat leaderboards ----------------------------------------------------
//
// Statewide/national stat-leader tables ship as `{ columns[], rows[] }`. The
// stat *values* are self-describing — row[8] aligns positionally with `columns`,
// which carries the display names — but the surrounding 11-tuple has no key list
// anywhere in the site bundle (the renderer is React-compiler output that
// destructures through a memo cache, so nothing names the indices).
//
// The mapping below was therefore derived empirically and checked across a full
// 200-row table: rank equals row order; index 2 is always an /athletes/ URL and
// index 9 a team URL; index 8 always matches the column count; index 10 is
// always a two-letter state. Crucially, indices 5 and 6 are **city then school**,
// not the reverse — 199/200 rows put index 5 at the URL's city segment and
// 189/200 put index 6 at its school segment. The first row of a table is a bad
// witness for this, because a school named after its town ("Kinston", "Kinston")
// reads identically either way.
//
// Because this is inference rather than a lifted key list, `decodeStatLeaders`
// validates the shape and returns the raw rows untouched when it does not hold,
// rather than emitting a confidently mislabelled table.

const STAT_ROW_ARITY = 11;
const IDX = {
  firstName: 0,
  lastName: 1,
  athleteUrl: 2,
  positions: 3,
  rank: 4,
  city: 5,
  schoolName: 6,
  schoolAcronym: 7,
  stats: 8,
  teamUrl: 9,
  stateCode: 10,
} as const;

export interface StatLeader {
  rank: number | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  positions: string | null;
  schoolName: string | null;
  city: string | null;
  schoolAcronym: string | null;
  stateCode: string | null;
  athleteUrl: string | null;
  teamPath: string | null;
  stats: Record<string, string | number | null>;
}

export interface StatLeaderTable {
  columns: { name: string; displayName: string; header: string }[];
  leaders: StatLeader[];
  /** Set when the row shape did not validate; `rawRows` carries the payload as-is. */
  decodeWarning?: string;
  rawRows?: unknown[];
}

const looksLikeStatRow = (r: unknown, columnCount: number): boolean =>
  Array.isArray(r) &&
  r.length === STAT_ROW_ARITY &&
  Array.isArray(r[IDX.stats]) &&
  (r[IDX.stats] as unknown[]).length === columnCount;

/** Decode a `statLeadersListData` table, degrading to raw rows on shape drift. */
export function decodeStatLeaders(listData: Props): StatLeaderTable {
  const cols = (Array.isArray(listData.columns) ? listData.columns : []) as Record<string, unknown>[];
  const rows = Array.isArray(listData.rows) ? listData.rows : [];
  const columns = cols.map((c) => ({
    name: String(c.name ?? ''),
    displayName: String(c.displayName ?? c.name ?? ''),
    header: String(c.header ?? ''),
  }));

  if (rows.length > 0 && !rows.every((r) => looksLikeStatRow(r, columns.length))) {
    return {
      columns,
      leaders: [],
      decodeWarning:
        'MaxPreps changed the stat-leader row shape, so the rows are returned undecoded. ' +
        `Expected ${STAT_ROW_ARITY} fields with a ${columns.length}-value stat array.`,
      rawRows: rows,
    };
  }

  return {
    columns,
    leaders: rows.map((row) => {
      const r = row as unknown[];
      const values = (r[IDX.stats] as unknown[]) ?? [];
      const stats: Record<string, string | number | null> = {};
      columns.forEach((c, i) => {
        stats[c.displayName || c.name] = (values[i] as string | number | null) ?? null;
      });
      return {
        rank: num(r[IDX.rank]),
        name: [str(r[IDX.firstName]), str(r[IDX.lastName])].filter(Boolean).join(' '),
        firstName: str(r[IDX.firstName]),
        lastName: str(r[IDX.lastName]),
        positions: str(r[IDX.positions]),
        schoolName: str(r[IDX.schoolName]),
        city: str(r[IDX.city]),
        schoolAcronym: str(r[IDX.schoolAcronym]),
        stateCode: str(r[IDX.stateCode]),
        athleteUrl: str(r[IDX.athleteUrl]),
        teamPath: (() => {
          const u = str(r[IDX.teamUrl]);
          if (!u) return null;
          return u
            .replace(/^https?:\/\/[^/]+\//, '')
            .replace(/^\/+/, '')
            .replace(/\/(?:\d{2}-\d{2}\/)?(?:schedule|roster|stats|rankings|standings)\/?$/, '');
        })(),
        stats,
      };
    }),
  };
}

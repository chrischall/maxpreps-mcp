import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { minifiedResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { parseSiteUrl, buildStatLeadersIndexPath, SEASON_RE } from '../paths.js';
import { decodeStatLeaders } from '../decode.js';

const SPORT_RE = /^[a-z0-9-]+$/;

const sportArg = z.string().min(1).regex(SPORT_RE, 'Use a lowercase slug, e.g. football');
// Regex, not a length check: this value is interpolated into a fetched URL, and
// a two-character `..` would climb a path segment. buildStatLeadersIndexPath
// re-validates it, so this is defence in depth with a clearer error message.
const stateArg = z
  .string()
  .regex(/^[A-Za-z]{2}$/, 'Use a two-letter state code, e.g. NC')
  .optional()
  .describe('Two-letter state code, e.g. NC. Omit for national leaders.');
const seasonArg = z
  .string()
  .regex(SEASON_RE, 'Season must look like 25-26')
  .optional()
  .describe('Season label, e.g. 25-26. Omit for the current season.');

export function registerStatLeaderTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_list_stat_categories',
    {
      title: 'List MaxPreps stat leaderboard categories',
      description:
        'Which statistical leaderboards exist for a sport, with the path to each one plus the national and ' +
        'in-scope averages and the games-played minimum. **Call this before maxpreps_get_stat_leaderboard** — ' +
        'the leaf path is not derivable from the stat name (Total TDs lives at `touchdowns/tot-tds`, Sacks at ' +
        '`sacks/tot-sacks`), so the path must come from here. Read-only.',
      annotations: toolAnnotations({
        title: 'List MaxPreps stat leaderboard categories',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        sport: sportArg.describe('Sport slug as used in MaxPreps URLs, e.g. football'),
        state: stateArg,
        season: seasonArg,
      },
    },
    async ({ sport, state, season }) => {
      const path = buildStatLeadersIndexPath(sport, state, season);
      const props = await client.page(path);
      const data = (props.statLeadersData ?? {}) as Record<string, unknown>;
      const seasons = Array.isArray(data.seasons) ? data.seasons : [];

      const categories = seasons.flatMap((s) => {
        const sec = s as Record<string, unknown>;
        const cats = Array.isArray(sec.categories) ? sec.categories : [];
        return cats.map((c) => {
          const cat = c as Record<string, unknown>;
          const url = typeof cat.canonicalUrl === 'string' ? cat.canonicalUrl : '';
          return {
            statName: cat.statName ?? null,
            group: cat.groupName ?? null,
            subGroup: cat.subGroupName ?? null,
            header: cat.statHeader ?? null,
            nationalAverage: cat.nationalAverage ?? null,
            contextAverage: cat.contextAverage ?? null,
            season: sec.year ?? null,
            minGamesPlayed: sec.minGamesPlayed ?? null,
            // Feed this straight to maxpreps_get_stat_leaderboard.
            path: url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, ''),
          };
        });
      });

      return minifiedResult({
        path,
        count: categories.length,
        categories,
        ...(categories.length === 0
          ? { note: 'No stat leaderboards published for this sport/season — coverage varies, and the current season is empty until it is under way.' }
          : {}),
      });
    },
  );

  server.registerTool(
    'maxpreps_get_stat_leaderboard',
    {
      title: 'Get a MaxPreps stat leaderboard',
      description:
        'The ranked athletes for one statistical category across a state or nationally — up to 200 per board, ' +
        'each with their full stat line, school, and a `teamPath` for the other team tools. Take `path` from ' +
        'maxpreps_list_stat_categories rather than constructing it. If MaxPreps changes the row shape the rows ' +
        'are returned undecoded with a warning rather than mislabelled. Read-only.',
      annotations: toolAnnotations({
        title: 'Get a MaxPreps stat leaderboard',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('Leaderboard path from maxpreps_list_stat_categories, e.g. nc/football/25-26/stat-leaders/offense/passing/yds'),
        limit: z.number().int().positive().max(200).default(50).describe('Max athletes to return'),
      },
    },
    async ({ path, limit }) => {
      const { path: bare, query } = parseSiteUrl(path);
      const props = await client.page(bare, query);
      const listData = (props.statLeadersListData ?? {}) as Record<string, unknown>;
      const table = decodeStatLeaders(listData);

      if (table.decodeWarning) {
        return minifiedResult({
          path: bare,
          warning: table.decodeWarning,
          columns: table.columns,
          rawRows: table.rawRows,
        });
      }

      return minifiedResult({
        path: bare,
        stat: listData.statHeader ?? null,
        group: listData.group ?? null,
        subGroup: listData.subGroup ?? null,
        minimums: listData.minimums ?? null,
        totalCount: table.leaders.length,
        columns: table.columns.map((c) => c.displayName),
        leaders: table.leaders.slice(0, limit),
        ...(table.leaders.length === 0
          ? { note: 'No qualifying athletes on this leaderboard for the season.' }
          : {}),
      });
    },
  );
}

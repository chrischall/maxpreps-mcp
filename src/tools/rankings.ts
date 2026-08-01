import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { buildRankingsPath, buildTeamPath, SEASON_RE } from '../paths.js';
import { teamArg, seasonArg } from './team.js';

const PAGE_SIZE = 25;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Turn a full team URL into the bare path the team tools accept. */
function toTeamPath(url: unknown): string | null {
  const raw = str(url);
  if (!raw) return null;
  const path = raw.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '');
  try {
    // Strip any season/tab so the result is a plain team path.
    return buildTeamPath(path);
  } catch {
    return path || null;
  }
}

export function registerRankingsTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_get_rankings',
    {
      title: 'Get MaxPreps team rankings',
      description:
        'Ranked leaderboard of teams for a sport — nationally, or within one state. Each entry carries the rank, ' +
        'rating, overall record, movement, and a `teamPath` ready to pass to the other team tools, so this is the ' +
        'way to discover teams rather than look one up. Results are paginated 25 at a time. Omitting `season` uses ' +
        'the current one, which is empty before that sport is under way. Read-only.',
      annotations: toolAnnotations({
        title: 'Get MaxPreps team rankings',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        sport: z.string().min(1).describe('Sport slug as used in MaxPreps URLs, e.g. football, basketball'),
        state: z
          .string()
          .length(2)
          .optional()
          .describe('Two-letter state code, e.g. NC. Omit for national rankings.'),
        season: z
          .string()
          .regex(SEASON_RE, 'Season must look like 25-26')
          .optional()
          .describe('Season label, e.g. 25-26. Omit for the current season.'),
        pageNumber: z.number().int().positive().default(1).describe('1-based page; 25 teams per page'),
      },
    },
    async ({ sport, state, season, pageNumber }) => {
      const path = buildRankingsPath({ sport, state, season, pageNumber });
      const props = await client.page(path);
      const data = (props.rankingsListData ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(data.rankings) ? data.rankings : [];
      const total = typeof data.totalCount === 'number' ? data.totalCount : rows.length;

      const teams = rows.map((r) => {
        const t = r as Record<string, unknown>;
        return { ...t, teamPath: toTeamPath(t.teamLink) };
      });

      return textResult({
        path,
        scope: state ? state.toUpperCase() : 'National',
        sport,
        season: data.year ?? season ?? null,
        lastUpdated: data.lastUpdated ?? null,
        totalCount: total,
        pageNumber,
        pageSize: PAGE_SIZE,
        hasMore: pageNumber * PAGE_SIZE < total,
        teams,
        ...(rows.length === 0
          ? {
              note: `No ranked teams for this season${season ? '' : ' (the current one)'}. Rankings populate once the season is under way — pass an earlier season such as 25-26.`,
            }
          : {}),
      });
    },
  );

  server.registerTool(
    'maxpreps_get_team_rankings',
    {
      title: 'Get one team’s rankings',
      description:
        'Where a single team sits in each ranking MaxPreps publishes for it — typically national, state, state ' +
        'division/class, and metro area — along with the teams ranked immediately around it. Use this for "how ' +
        'good is this team"; use maxpreps_get_rankings to browse a whole leaderboard. Read-only.',
      annotations: toolAnnotations({
        title: 'Get one team’s rankings',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        team: teamArg,
        season: seasonArg,
      },
    },
    async ({ team, season }) => {
      const path = buildTeamPath(team, 'rankings', season);
      const props = await client.page(path);
      const data = (props.rankingsData ?? {}) as Record<string, unknown>;
      const rawContexts = Array.isArray(data.contexts) ? data.contexts : [];

      const contexts = rawContexts.map((c) => {
        const ctx = c as Record<string, unknown>;
        const entries = Array.isArray(ctx.entries) ? ctx.entries : [];
        return {
          contextName: ctx.contextName ?? null,
          contextType: ctx.contextType ?? null,
          fullListUrl: ctx.canonicalUrl ?? null,
          nearby: entries.map((e) => {
            const t = e as Record<string, unknown>;
            return { ...t, teamPath: toTeamPath(t.teamCanonicalUrl ?? t.teamLink) };
          }),
        };
      });

      return textResult({
        path,
        contexts,
        historical: props.historicalRankingsData ?? null,
        ...(contexts.length === 0
          ? { note: 'MaxPreps publishes no rankings for this team season — common outside the main sports, or before the season is under way.' }
          : {}),
      });
    },
  );
}

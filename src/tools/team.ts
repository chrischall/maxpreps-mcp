import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { buildTeamPath, SEASON_RE } from '../paths.js';
import { extractTeams } from '../teams.js';

export const teamArg = z
  .string()
  .min(1)
  .describe('Team site path or URL, e.g. nc/charlotte/myers-park-mustangs/football');

export const seasonArg = z
  .string()
  .regex(SEASON_RE, 'Season must look like 25-26')
  .optional()
  .describe('Season label, e.g. 25-26. Omit for the current season.');

export function registerTeamTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_get_team',
    {
      title: 'Get a MaxPreps team season',
      description:
        'Team overview for one season: sport/level/season identifiers, the win-loss record and points for/against, ' +
        'conference standing, rankings, and the full list of seasons this team has on MaxPreps (roughly 20 years). ' +
        'Use it to confirm a record without summing a schedule. Read-only.',
      annotations: toolAnnotations({
        title: 'Get a MaxPreps team season',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        team: teamArg,
        season: seasonArg,
        includeSeasons: z.boolean().default(true).describe('Include the list of available seasons'),
      },
    },
    async ({ team, season, includeSeasons }) => {
      const path = buildTeamPath(team, undefined, season);
      const props = await client.page(path);
      const ctx = (props.teamContext ?? {}) as Record<string, unknown>;
      return textResult({
        path,
        team: ctx.data ?? null,
        standings: ctx.standingsData ?? null,
        lastSeasonStandings: ctx.lastYearStandingsData ?? null,
        rankings: ctx.rankingsData ?? null,
        ...(includeSeasons ? { seasons: extractTeams(props).filter((t) => t.year !== null) } : {}),
      });
    },
  );
}

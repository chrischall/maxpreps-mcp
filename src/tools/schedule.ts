import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { buildTeamPath } from '../paths.js';
import { decodeSchedule } from '../decode.js';
import { teamArg, seasonArg } from './team.js';

export function registerScheduleTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_get_schedule',
    {
      title: 'Get a MaxPreps team schedule and scores',
      description:
        'Every game for a team season, with the result and both scores. Scores are oriented team-vs-opponent ' +
        '(`teamScore`/`opponentScore`); the raw `resultString` MaxPreps renders is winner-first, so a loss reads ' +
        '"L 20-13" even when the team scored 13. Soft-deleted contests are hidden by default, matching the site. ' +
        'Before opening day a current season legitimately has no results — check a prior season. Read-only.',
      annotations: toolAnnotations({
        title: 'Get a MaxPreps team schedule and scores',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        team: teamArg,
        season: seasonArg,
        played: z
          .enum(['all', 'completed', 'upcoming'])
          .default('all')
          .describe('Filter to games with a result, games without one, or both'),
        includeDeleted: z.boolean().default(false).describe('Include soft-deleted contests the site hides'),
      },
    },
    async ({ team, season, played, includeDeleted }) => {
      const path = buildTeamPath(team, 'schedule', season);
      const props = await client.page(path);
      const all = decodeSchedule(props, { includeDeleted });
      const games =
        played === 'completed'
          ? all.filter((g) => g.hasResult)
          : played === 'upcoming'
            ? all.filter((g) => !g.hasResult)
            : all;

      const completed = all.filter((g) => g.hasResult);
      const record = {
        wins: completed.filter((g) => g.result === 'W').length,
        losses: completed.filter((g) => g.result === 'L').length,
        ties: completed.filter((g) => g.result === 'T').length,
        pointsFor: completed.reduce((n, g) => n + (g.teamScore ?? 0), 0),
        pointsAgainst: completed.reduce((n, g) => n + (g.opponentScore ?? 0), 0),
      };

      return textResult({
        path,
        count: games.length,
        record,
        games,
        ...(all.length === 0
          ? { note: 'No contests on this page. The season may not have started, or the team may not publish a schedule — try a prior season via maxpreps_get_team.' }
          : {}),
      });
    },
  );
}

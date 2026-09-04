import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { minifiedResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { buildTeamPath } from '../paths.js';
import { decodeRoster } from '../decode.js';
import { teamArg, seasonArg } from './team.js';

export function registerRosterTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_get_roster',
    {
      title: 'Get a MaxPreps team roster',
      description:
        'Players on a team for one season: jersey, name, class year, positions, height and weight. Soft-deleted ' +
        'entries (duplicates and departed players the site hides) are excluded by default — a roster payload often ' +
        'carries substantially more rows than the page shows. Height and weight are null when the school did not ' +
        'publish them. Read-only.',
      annotations: toolAnnotations({
        title: 'Get a MaxPreps team roster',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        team: teamArg,
        season: seasonArg,
        includeDeleted: z.boolean().default(false).describe('Include soft-deleted roster entries the site hides'),
        position: z.string().optional().describe('Case-insensitive filter on position, e.g. "QB"'),
      },
    },
    async ({ team, season, includeDeleted, position }) => {
      const path = buildTeamPath(team, 'roster', season);
      const props = await client.page(path);
      let players = decodeRoster(props, { includeDeleted });
      if (position) {
        const needle = position.toLowerCase();
        players = players.filter((p) => p.positions.toLowerCase().split(/,\s*/).includes(needle));
      }
      return minifiedResult({
        path,
        count: players.length,
        players,
        ...(players.length === 0
          ? { note: 'No players. The season may not have started yet, or the school may not publish a roster — try a prior season via maxpreps_get_team.' }
          : {}),
      });
    },
  );
}

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { buildTeamPath } from '../paths.js';
import { teamArg, seasonArg } from './team.js';

export function registerStatsTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_get_stat_leaders',
    {
      title: 'Get MaxPreps team stat leaders',
      description:
        'Statistical leaders for a team season — each entry names the athlete, the stat, its value and the ' +
        "athlete's career URL. Also returns the qualifying minimums and the stat refresh time. Coverage varies " +
        'by sport and by how diligently the school reports; an empty result is normal, not an error. Read-only.',
      annotations: toolAnnotations({
        title: 'Get MaxPreps team stat leaders',
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
      const path = buildTeamPath(team, 'stats', season);
      const props = await client.page(path);
      const data = (props.playerStatLeadersData ?? null) as {
        leaders?: unknown[];
        minimums?: unknown;
        lastUpdated?: unknown;
      } | null;
      const leaders = data?.leaders ?? [];
      return textResult({
        path,
        count: leaders.length,
        lastUpdated: data?.lastUpdated ?? null,
        leaders,
        minimums: data?.minimums ?? null,
        ...(leaders.length === 0
          ? { note: 'No stat leaders published for this team season. Stats depend on the school reporting them.' }
          : {}),
      });
    },
  );
}

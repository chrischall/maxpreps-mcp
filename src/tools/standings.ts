import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { minifiedResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { buildTeamPath } from '../paths.js';
import { teamArg, seasonArg } from './team.js';

export function registerStandingsTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_get_standings',
    {
      title: 'Get conference standings',
      description:
        "The standings table a team sits in — every team in the conference with its conference and overall " +
        'records and placement, not just this team\'s own line (maxpreps_get_team gives that). Also returns the ' +
        'ranked statistical leaders MaxPreps highlights for the season. Read-only.',
      annotations: toolAnnotations({
        title: 'Get conference standings',
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
      const path = buildTeamPath(team, 'standings', season);
      const props = await client.page(path);
      const data = (props.standingsData ?? {}) as Record<string, unknown>;
      const rawSections = Array.isArray(data.standingSections) ? data.standingSections : [];

      const sections = rawSections.map((s) => {
        const sec = s as Record<string, unknown>;
        return {
          name: sec.headerName ?? null,
          type: sec.headerType ?? null,
          fullStandingsUrl: sec.fullStandingsLink ?? null,
          teams: Array.isArray(sec.standings) ? sec.standings : [],
        };
      });

      const leaderStats = Array.isArray(props.leaderStats) ? props.leaderStats : [];
      const teamCount = sections.reduce((n, s) => n + s.teams.length, 0);

      return minifiedResult({
        path,
        sectionCount: sections.length,
        teamCount,
        sections,
        leaderStats,
        ...(teamCount === 0
          ? { note: 'No standings published for this team season — the sport may not run a conference table, or the season may not have started.' }
          : {}),
      });
    },
  );
}

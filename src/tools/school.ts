import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { minifiedResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { parseSiteUrl } from '../paths.js';
import { extractTeams } from '../teams.js';

const schoolArg = z
  .string()
  .min(1)
  .describe('School site path or maxpreps.com URL, e.g. nc/charlotte/myers-park-mustangs');

export function registerSchoolTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_get_school',
    {
      title: 'Get a MaxPreps school profile',
      description:
        'School profile: identifiers, location, state athletic association, partner flags, plus nearby schools ' +
        'and recent articles/videos. Take the path from maxpreps_search. Read-only.',
      annotations: toolAnnotations({
        title: 'Get a MaxPreps school profile',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        school: schoolArg,
        includeNearby: z.boolean().default(false).describe('Include the nearby-schools list'),
      },
    },
    async ({ school, includeNearby }) => {
      const { path } = parseSiteUrl(school);
      const props = await client.page(path);
      return minifiedResult({
        path,
        school: props.schoolContext ?? null,
        links: props.schoolLinksData ?? null,
        ...(includeNearby ? { nearbySchools: props.nearbySchools ?? [] } : {}),
      });
    },
  );

  server.registerTool(
    'maxpreps_list_teams',
    {
      title: 'List a school’s teams',
      description:
        'Every team path a school publishes, with sport, gender and level. Call this before any team tool — the ' +
        'sport path segments are not guessable (the default gender varies by sport, so girls golf is ' +
        '"golf/girls" while boys golf is "golf/spring", and field hockey has no gender segment at all). ' +
        'Passing a team path instead of a school path returns that team’s seasons. Read-only.',
      annotations: toolAnnotations({
        title: 'List a school’s teams',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        school: schoolArg,
        sport: z.string().optional().describe('Case-insensitive filter on the sport name, e.g. "football"'),
        level: z.string().optional().describe('Filter on level, e.g. "Varsity", "JV", "Freshman"'),
      },
    },
    async ({ school, sport, level }) => {
      const { path } = parseSiteUrl(school);
      const props = await client.page(path);
      let teams = extractTeams(props);
      if (sport) {
        const needle = sport.toLowerCase();
        teams = teams.filter((t) => t.sport?.toLowerCase().includes(needle));
      }
      if (level) {
        const needle = level.toLowerCase();
        teams = teams.filter((t) => t.level?.toLowerCase() === needle);
      }
      return minifiedResult({
        path,
        count: teams.length,
        teams,
        ...(teams.length === 0
          ? { note: 'No teams matched. Drop the filters, or confirm the path with maxpreps_search.' }
          : {}),
      });
    },
  );
}

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHelpfulError, minifiedResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { parseSiteUrl } from '../paths.js';

export function registerAthleteTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_get_athlete',
    {
      title: 'Get a MaxPreps athlete career',
      description:
        'One athlete’s career page: season history, sports played, and available data. Pass the ' +
        '`careerCanonicalUrl` from maxpreps_search verbatim — it carries the required `careerid` parameter, ' +
        'without which the page cannot be addressed. Read-only.',
      annotations: toolAnnotations({
        title: 'Get a MaxPreps athlete career',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        athlete: z
          .string()
          .min(1)
          .describe('Athlete career path or URL, including ?careerid=… (use search’s careerCanonicalUrl)'),
        careerId: z.string().optional().describe('careerid, if not already present in the path'),
      },
    },
    async ({ athlete, careerId }) => {
      const { path, query } = parseSiteUrl(athlete);
      const careerid = careerId ?? query.careerid;
      if (!careerid) {
        throw createHelpfulError('An athlete career page needs a careerid.', {
          hint: 'Pass the careerCanonicalUrl from maxpreps_search unchanged (it ends in ?careerid=…), or supply careerId.',
        });
      }
      const props = await client.page(path, { careerid });
      // Some career records are stubs — search surfaces them (often under a
      // generic "<School> Athlete" name) but their page carries no profile at
      // all. Say so rather than returning a shell of nulls.
      const name = (props.athleteName ?? null) as string | null;
      const career = props.careerContext ?? null;
      const empty = name === null && career === null;
      return minifiedResult({
        path,
        careerId: careerid,
        name,
        career,
        availability: props.careerDataAvailability ?? null,
        history: props.careerHistoryData ?? null,
        ...(empty
          ? { note: 'This career record has no published profile page — MaxPreps indexes some athletes without publishing their career data. Nothing further is retrievable for this careerid.' }
          : {}),
      });
    },
  );
}

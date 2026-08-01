import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { parseSiteUrl } from '../paths.js';

export function registerUtilityTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_healthcheck',
    {
      title: 'Check MaxPreps connectivity',
      description:
        'Verify MaxPreps is reachable and that the site build id — which every data route embeds and which ' +
        'changes on each deploy — resolves. Also probes a real data route, so a pass means tools will work. ' +
        'Reports a failure rather than throwing. No credentials are required by this server. Read-only.',
      annotations: toolAnnotations({
        title: 'Check MaxPreps connectivity',
        readOnly: true,
        idempotent: false,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => textResult(await client.healthcheck()),
  );

  server.registerTool(
    'maxpreps_get_page',
    {
      title: 'Get raw MaxPreps page data',
      description:
        'Escape hatch: return the raw server-rendered data for any public MaxPreps page, undecoded. Use when a ' +
        'dedicated tool does not cover what you need (playoff brackets, conference standings, article listings). ' +
        'Note that positional payloads — team rosters and schedules — arrive as bare arrays here with no field ' +
        'names; use maxpreps_get_roster / maxpreps_get_schedule for those. Read-only.',
      annotations: toolAnnotations({
        title: 'Get raw MaxPreps page data',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        path: z.string().min(1).describe('Site path or maxpreps.com URL'),
        keysOnly: z
          .boolean()
          .default(false)
          .describe('Return only the top-level prop names and their types — cheap way to explore a page'),
      },
    },
    async ({ path, keysOnly }) => {
      const parsed = parseSiteUrl(path);
      const props = await client.page(parsed.path, parsed.query);
      if (!keysOnly) return textResult({ path: parsed.path, pageProps: props });
      const shape = Object.entries(props).map(([key, value]) => ({
        key,
        type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
        ...(Array.isArray(value) ? { length: value.length } : {}),
      }));
      return textResult({ path: parsed.path, keys: shape });
    },
  );
}

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { minifiedResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';

interface SearchProps extends Record<string, unknown> {
  initialSchoolResults?: unknown[] | null;
  initialCareerResults?: unknown[] | null;
}

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    'maxpreps_search',
    {
      title: 'Search MaxPreps schools and athletes',
      description:
        'Find a high school or an athlete by name. This is the entry point for every other tool: it returns each ' +
        "school's canonicalUrl (the site path the team tools need) and each athlete's careerCanonicalUrl. " +
        'Search is exact-ish — prefer the plain school name ("myers park"), because appending qualifiers ' +
        'like "high" or "high school" usually returns nothing. Read-only.',
      annotations: toolAnnotations({
        title: 'Search MaxPreps schools and athletes',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        query: z.string().min(1).describe('School or athlete name, e.g. "myers park" or "brody keefe"'),
        limit: z.number().int().positive().max(100).default(25).describe('Max results per category'),
      },
    },
    async ({ query, limit }) => {
      const props = await client.page<SearchProps>('search', { q: query });
      const schools = (props.initialSchoolResults ?? []).slice(0, limit);
      const athletes = (props.initialCareerResults ?? []).slice(0, limit);
      return minifiedResult({
        query,
        schoolCount: schools.length,
        athleteCount: athletes.length,
        schools,
        athletes,
        ...(schools.length === 0 && athletes.length === 0
          ? { note: 'No matches. Search is literal — try just the school name with no "high"/"high school" suffix.' }
          : {}),
      });
    },
  );
}

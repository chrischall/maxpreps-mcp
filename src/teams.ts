import type { PageProps } from './client.js';

export interface TeamRef {
  /** Site path, ready to pass to any team tool. */
  path: string;
  sport: string | null;
  gender: string | null;
  level: string | null;
  season: string | null;
  year: string | null;
  isPublished: boolean | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * Collect every team a page references.
 *
 * MaxPreps scatters team descriptors through several unrelated props (the school
 * link block, the season picker, the nav menu), all sharing the same shape: a
 * `canonicalUrl` alongside a `sport`. Walking for that pair is far more durable
 * than reading one named prop, which differs between the school page and a team
 * page. Deduplicated by path, first occurrence winning.
 */
export function extractTeams(pageProps: PageProps): TeamRef[] {
  const found = new Map<string, TeamRef>();

  const visit = (node: unknown, depth: number): void => {
    if (depth > 12 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const rec = node as Record<string, unknown>;
    const url = str(rec.canonicalUrl);
    if (url && rec.sport !== undefined) {
      const path = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '');
      if (path && !found.has(path)) {
        found.set(path, {
          path,
          sport: str(rec.sport),
          gender: str(rec.gender),
          level: str(rec.teamLevel) ?? str(rec.level),
          season: str(rec.season),
          year: str(rec.year),
          isPublished: typeof rec.isPublished === 'boolean' ? rec.isPublished : null,
        });
      }
    }
    for (const value of Object.values(rec)) visit(value, depth + 1);
  };

  visit(pageProps, 0);
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
}

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadDotenvSafely,
  readEnvVar,
  buildQueryString,
  createHelpfulError,
  formatApiError,
  McpToolError,
  RateLimitError,
  UnreachableError,
  createThrottle,
  type Throttle,
} from '@chrischall/mcp-utils';
import { VERSION } from './version.js';

// Load .env for local dev. Wrapped because a bundled/serverless runtime has no
// meaningful `import.meta.url`, and `loadDotenvSafely` also tolerates a missing
// dotenv module (the .mcpb bundle externalises it).
try {
  const here = dirname(fileURLToPath(import.meta.url));
  await loadDotenvSafely({ path: join(here, '..', '.env'), override: false });
} catch {
  /* no filesystem — carry on with the ambient env */
}

const ORIGIN = 'https://www.maxpreps.com';
const SERVICE = 'MaxPreps';

// MaxPreps is a public site with no documented API and no rate-limit contract.
// Space requests out so this server stays a well-behaved reader.
const DEFAULT_MIN_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 20_000;
// The buildId only changes when the site deploys; a stale one self-heals on 404.
const DEFAULT_BUILD_ID_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CACHE_MAX = 200;

const BUILD_ID_RE = /"buildId":"([^"\\]+)/;

export type Query = Record<string, string | number | undefined>;
export type PageProps = Record<string, unknown>;

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  throttle?: Throttle;
  now?: () => number;
  userAgent?: string;
  timeoutMs?: number;
  buildIdTtlMs?: number;
  /** `0` disables the response cache (tests use this). */
  cacheTtlMs?: number;
  cacheMax?: number;
}

interface CacheEntry {
  at: number;
  value: PageProps;
}

const numEnv = (name: string, fallback: number): number => {
  const raw = readEnvVar(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export class MaxPrepsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly throttle: Throttle;
  private readonly now: () => number;
  private readonly ua: string;
  private readonly timeoutMs: number;
  private readonly buildIdTtlMs: number;
  private readonly cacheTtlMs: number;
  private readonly cacheMax: number;

  private buildIdValue: string | null = null;
  private buildIdAt = 0;
  /** Shared in-flight resolution so concurrent callers scrape the homepage once. */
  private buildIdInFlight: Promise<string> | null = null;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(opts: ClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.now = opts.now ?? Date.now;
    this.ua =
      opts.userAgent ??
      readEnvVar('MAXPREPS_USER_AGENT') ??
      `maxpreps-mcp/${VERSION} (+https://github.com/chrischall/maxpreps-mcp)`;
    this.timeoutMs = opts.timeoutMs ?? numEnv('MAXPREPS_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    this.buildIdTtlMs = opts.buildIdTtlMs ?? DEFAULT_BUILD_ID_TTL_MS;
    this.cacheTtlMs = opts.cacheTtlMs ?? numEnv('MAXPREPS_CACHE_TTL', DEFAULT_CACHE_TTL_MS / 1000) * 1000;
    this.cacheMax = opts.cacheMax ?? DEFAULT_CACHE_MAX;
    this.throttle =
      opts.throttle ??
      createThrottle({ minIntervalMs: numEnv('MAXPREPS_MIN_INTERVAL_MS', DEFAULT_MIN_INTERVAL_MS) });
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  private async send(url: string, accept: string): Promise<Response> {
    return this.throttle(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await this.fetchImpl(url, {
          headers: { 'User-Agent': this.ua, Accept: accept },
          signal: controller.signal,
          redirect: 'follow',
        });
      } catch {
        // AbortError and a genuine network failure are the same story to a caller.
        throw new UnreachableError(SERVICE);
      } finally {
        clearTimeout(timer);
      }
    });
  }

  /**
   * The Next.js build id, which every `_next/data` URL embeds. Cached for
   * `buildIdTtlMs`; `force` bypasses the cache after a 404.
   */
  async buildId(force = false): Promise<string> {
    if (!force && this.buildIdValue && this.now() - this.buildIdAt < this.buildIdTtlMs) {
      return this.buildIdValue;
    }
    if (!force && this.buildIdInFlight) return this.buildIdInFlight;

    const run = (async () => {
      const res = await this.send(`${ORIGIN}/`, 'text/html');
      if (!res.ok) {
        throw new McpToolError(
          formatApiError(res.status, 'GET', '/', '', { service: SERVICE }) +
            ' (while resolving the site buildId)',
        );
      }
      const match = BUILD_ID_RE.exec(await res.text());
      if (!match) {
        throw createHelpfulError('Could not find a buildId on the MaxPreps homepage.', {
          hint: 'MaxPreps changed its page shape, so the _next/data JSON routes cannot be addressed. The server needs updating.',
        });
      }
      this.buildIdValue = match[1];
      this.buildIdAt = this.now();
      return this.buildIdValue;
    })();

    this.buildIdInFlight = run;
    try {
      return await run;
    } finally {
      this.buildIdInFlight = null;
    }
  }

  private cacheGet(key: string): PageProps | undefined {
    if (this.cacheTtlMs <= 0) return undefined;
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at >= this.cacheTtlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return hit.value;
  }

  private cacheSet(key: string, value: PageProps): void {
    if (this.cacheTtlMs <= 0) return;
    this.cache.set(key, { at: this.now(), value });
    while (this.cache.size > this.cacheMax) {
      // Map preserves insertion order, so the first key is the oldest.
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
  }

  /**
   * Fetch one public page's `pageProps` from its `_next/data` JSON twin.
   *
   * `path` is the site path without leading/trailing slashes, e.g.
   * `nc/charlotte/myers-park-mustangs/football/25-26/schedule`.
   */
  async page<T extends PageProps = PageProps>(path: string, query: Query = {}): Promise<T> {
    const bare = String(path).replace(/^\/+|\/+$/g, '');
    const qs = buildQueryString(query);
    const cacheKey = `${bare}${qs}`;
    const cached = this.cacheGet(cacheKey);
    if (cached) return cached as T;

    const props = await this.fetchPage(bare, qs, false);
    this.cacheSet(cacheKey, props);
    return props as T;
  }

  private async fetchPage(bare: string, qs: string, refreshed: boolean): Promise<PageProps> {
    const buildId = await this.buildId(refreshed);
    const url = `${ORIGIN}/_next/data/${encodeURIComponent(buildId)}/${bare}.json${qs}`;
    const res = await this.send(url, 'application/json');

    // A stale buildId 404s exactly like a bad path, so distinguish them by
    // re-resolving once: if a fresh id still 404s, the path is genuinely wrong.
    if (res.status === 404) {
      if (!refreshed) return this.fetchPage(bare, qs, true);
      throw createHelpfulError(`MaxPreps has no page at /${bare} (404).`, {
        hint: 'Check the path with maxpreps_search (schools) or maxpreps_list_teams (sport/gender/level segments) — they are not guessable.',
      });
    }
    if (res.status === 429 || res.status === 503) {
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new RateLimitError(SERVICE, retryAfter > 0 ? retryAfter : undefined);
    }
    const text = await res.text();
    if (!res.ok) {
      throw new McpToolError(formatApiError(res.status, 'GET', `/${bare}`, text, { service: SERVICE }));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // A 2xx that isn't JSON means we were served a page rather than data —
      // an interstitial or a redirect to HTML. Say so instead of leaking a
      // JSON.parse SyntaxError.
      throw createHelpfulError(`MaxPreps returned HTML, not JSON, for /${bare}.`, {
        hint: 'The request was answered with a page rather than its data route — usually a redirect or an interstitial. Retry; if it persists the route shape changed.',
      });
    }

    const props = (parsed as { pageProps?: PageProps })?.pageProps;
    if (!props || typeof props !== 'object') {
      throw createHelpfulError(`MaxPreps returned no pageProps for /${bare}.`, {
        hint: 'The route exists but carries no data payload. Some pages hydrate client-side and have nothing server-rendered.',
      });
    }
    return props;
  }

  /** Connectivity + buildId probe. Never throws; reports the failure instead. */
  async healthcheck(): Promise<{
    ok: boolean;
    service: string;
    origin: string;
    buildId?: string;
    version: string;
    cachedEntries: number;
    error?: string;
  }> {
    const base = { service: SERVICE, origin: ORIGIN, version: VERSION, cachedEntries: this.cache.size };
    try {
      const buildId = await this.buildId(true);
      // Prove the data routes answer, not just the homepage.
      await this.page('search', { q: 'maxpreps' });
      return { ok: true, ...base, buildId };
    } catch (e) {
      return { ok: false, ...base, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

/**
 * Module-level singleton shared by every tool module. MaxPreps needs no
 * credentials, so there is no deferred config error to carry — the server always
 * boots and every tool is usable out of the box.
 */
export const client = new MaxPrepsClient();

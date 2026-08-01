import { describe, it, expect, vi } from 'vitest';
import { MaxPrepsClient } from '../src/client.js';

const HOME_HTML = (buildId: string) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">{"props":{},"buildId":"${buildId}\\n"}</script></body></html>`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html' } });

/** A fetch stub that answers the homepage with `buildId` and pages from `pages`. */
function stubFetch(opts: {
  buildId?: string | (() => string);
  pages?: Record<string, () => Response>;
  onPage?: (url: string) => Response | undefined;
}) {
  const calls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://www.maxpreps.com/') {
      const b = typeof opts.buildId === 'function' ? opts.buildId() : (opts.buildId ?? 'BUILD1');
      return html(HOME_HTML(b));
    }
    const custom = opts.onPage?.(url);
    if (custom) return custom;
    const hit = opts.pages?.[url];
    if (hit) return hit();
    return new Response('not found', { status: 404 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const dataUrl = (buildId: string, path: string) =>
  `https://www.maxpreps.com/_next/data/${buildId}/${path}.json`;

/** No throttling / caching by default so tests assert one behaviour at a time. */
const mk = (fetchImpl: typeof fetch, extra = {}) =>
  new MaxPrepsClient({ fetchImpl, throttle: (fn) => fn(), cacheTtlMs: 0, ...extra });

describe('buildId resolution', () => {
  it('scrapes the homepage and strips the trailing newline escape', async () => {
    const { impl } = stubFetch({ buildId: '1785513693' });
    await expect(mk(impl).buildId()).resolves.toBe('1785513693');
  });

  it('caches the id across calls, hitting the homepage once', async () => {
    const { impl, calls } = stubFetch({});
    const c = mk(impl);
    await c.buildId();
    await c.buildId();
    expect(calls.filter((u) => u === 'https://www.maxpreps.com/')).toHaveLength(1);
  });

  it('single-flights concurrent resolution', async () => {
    const { impl, calls } = stubFetch({});
    const c = mk(impl);
    await Promise.all([c.buildId(), c.buildId(), c.buildId()]);
    expect(calls.filter((u) => u === 'https://www.maxpreps.com/')).toHaveLength(1);
  });

  it('re-resolves after the ttl lapses', async () => {
    let now = 1_000_000;
    const { impl, calls } = stubFetch({});
    const c = new MaxPrepsClient({
      fetchImpl: impl,
      throttle: (fn) => fn(),
      now: () => now,
      buildIdTtlMs: 1000,
    });
    await c.buildId();
    now += 2000;
    await c.buildId();
    expect(calls.filter((u) => u === 'https://www.maxpreps.com/')).toHaveLength(2);
  });

  it('throws an actionable error when the homepage has no buildId', async () => {
    const impl = vi.fn(async () => html('<html><body>nope</body></html>')) as unknown as typeof fetch;
    await expect(mk(impl).buildId()).rejects.toThrow(/buildId/i);
  });
});

describe('page fetching', () => {
  it('returns pageProps for a path', async () => {
    const { impl } = stubFetch({
      pages: { [dataUrl('BUILD1', 'nc/x/y/football/schedule')]: () => json({ pageProps: { contests: [1] } }) },
    });
    await expect(mk(impl).page('nc/x/y/football/schedule')).resolves.toEqual({ contests: [1] });
  });

  it('normalises leading and trailing slashes', async () => {
    const { impl } = stubFetch({ pages: { [dataUrl('BUILD1', 'a/b')]: () => json({ pageProps: { ok: true } }) } });
    await expect(mk(impl).page('/a/b/')).resolves.toEqual({ ok: true });
  });

  it('appends query params', async () => {
    const { impl, calls } = stubFetch({
      onPage: (u) => (u.includes('?q=myers+park') || u.includes('?q=myers%20park') ? json({ pageProps: { ok: 1 } }) : undefined),
    });
    await mk(impl).page('search', { q: 'myers park' });
    expect(calls.some((u) => /search\.json\?q=/.test(u))).toBe(true);
  });

  // The whole point of caching the buildId is that it goes stale on every deploy.
  it('refreshes a stale buildId once on 404 and retries', async () => {
    let current = 'OLD';
    const { impl, calls } = stubFetch({
      buildId: () => current,
      onPage: (u) => (u.includes('/NEW/') ? json({ pageProps: { ok: true } }) : undefined),
    });
    const c = mk(impl);
    await c.buildId(); // prime the cache with OLD
    current = 'NEW'; // site deploys
    await expect(c.page('a/b')).resolves.toEqual({ ok: true });
    expect(calls.filter((u) => u.includes('/OLD/'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/NEW/'))).toHaveLength(1);
  });

  it('reports a genuine 404 as a not-found error, not an infinite retry', async () => {
    const { impl, calls } = stubFetch({});
    await expect(mk(impl).page('no/such/page')).rejects.toThrow(/not found|404/i);
    // one attempt on the primed id, one after the refresh — never more
    expect(calls.filter((u) => u.includes('/_next/data/'))).toHaveLength(2);
  });

  it('surfaces a non-JSON 2xx as an upstream error rather than JSON.parse noise', async () => {
    const { impl } = stubFetch({
      pages: { [dataUrl('BUILD1', 'a/b')]: () => html('<html>interstitial</html>') },
    });
    await expect(mk(impl).page('a/b')).rejects.toThrow(/unexpected|not json|html/i);
  });

  it('maps 429 to a rate-limit error', async () => {
    const { impl } = stubFetch({
      pages: { [dataUrl('BUILD1', 'a/b')]: () => new Response('slow down', { status: 429 }) },
    });
    await expect(mk(impl).page('a/b')).rejects.toThrow(/rate|429/i);
  });

  it('maps a network failure to an unreachable error', async () => {
    const impl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://www.maxpreps.com/') return html(HOME_HTML('BUILD1'));
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    await expect(mk(impl).page('a/b')).rejects.toThrow(/unreachable|maxpreps/i);
  });
});

describe('response cache', () => {
  it('serves a repeat read from cache', async () => {
    let hits = 0;
    const { impl } = stubFetch({
      pages: {
        [dataUrl('BUILD1', 'a/b')]: () => {
          hits += 1;
          return json({ pageProps: { n: hits } });
        },
      },
    });
    const c = new MaxPrepsClient({ fetchImpl: impl, throttle: (fn) => fn(), cacheTtlMs: 60_000 });
    await c.page('a/b');
    await c.page('a/b');
    expect(hits).toBe(1);
  });

  it('expires entries past the ttl', async () => {
    let now = 0;
    let hits = 0;
    const { impl } = stubFetch({
      pages: {
        [dataUrl('BUILD1', 'a/b')]: () => {
          hits += 1;
          return json({ pageProps: { n: hits } });
        },
      },
    });
    const c = new MaxPrepsClient({ fetchImpl: impl, throttle: (fn) => fn(), cacheTtlMs: 1000, now: () => now });
    await c.page('a/b');
    now = 5000;
    await c.page('a/b');
    expect(hits).toBe(2);
  });

  it('keys the cache by query, not just path', async () => {
    const seen: string[] = [];
    const { impl } = stubFetch({
      onPage: (u) => {
        seen.push(u);
        return json({ pageProps: { ok: 1 } });
      },
    });
    const c = new MaxPrepsClient({ fetchImpl: impl, throttle: (fn) => fn(), cacheTtlMs: 60_000 });
    await c.page('search', { q: 'a' });
    await c.page('search', { q: 'b' });
    expect(seen).toHaveLength(2);
  });

  it('evicts oldest entries past the bound', async () => {
    const { impl } = stubFetch({ onPage: () => json({ pageProps: { ok: 1 } }) });
    const c = new MaxPrepsClient({ fetchImpl: impl, throttle: (fn) => fn(), cacheTtlMs: 60_000, cacheMax: 2 });
    await c.page('a');
    await c.page('b');
    await c.page('c');
    expect(c.cacheSize).toBeLessThanOrEqual(2);
  });
});

describe('healthcheck', () => {
  it('reports the resolved buildId and reachability', async () => {
    const { impl } = stubFetch({
      buildId: 'B7',
      // healthcheck probes the search route with a query, so match by prefix
      onPage: (u) =>
        u.startsWith(dataUrl('B7', 'search')) ? json({ pageProps: { initialSchoolResults: [] } }) : undefined,
    });
    const r = await mk(impl).healthcheck();
    expect(r).toMatchObject({ ok: true, buildId: 'B7' });
  });

  it('reports not-ok instead of throwing when the site is unreachable', async () => {
    const impl = vi.fn(async () => {
      throw new TypeError('down');
    }) as unknown as typeof fetch;
    const r = await mk(impl).healthcheck();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unreachable|down|maxpreps/i);
  });
});

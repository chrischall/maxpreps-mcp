/**
 * Context-group hints, published on each tool as `_meta.mint` (the mcp-host
 * context-groups contract). Inert data: a host that does not read them sees an
 * extra `_meta` key and nothing else. The shape is fixed by the host's
 * contract, so it is restated here rather than imported — this server takes no
 * dependency on mcp-host.
 *
 * Every tool here is a `lookup`. MaxPreps is a public directory: each read
 * needs a school or team path the person names, and there is no account to
 * list "my" teams from, so no read can answer "what's on at school?" with only
 * a subject and a date range — none is canonical and none declares a subject.
 * `aliases` are the words a person says: lowercase, at most 8, each at most 40
 * chars.
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'school';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
}

/** `_meta` for a MaxPreps tool: every tool here is in the `school` domain. */
export function schoolMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'school', intent, ...extra } };
}

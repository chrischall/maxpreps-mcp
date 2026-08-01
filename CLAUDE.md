# maxpreps-mcp

Read-only MCP server over MaxPreps' public Next.js data routes. No credentials
anywhere in this repo — no API key, no cookie, no OAuth, no browser bridge. If a
change starts introducing an auth path, that is a sign something has gone wrong.

## The one thing that makes this repo unusual

Two payloads — team **rosters** (`pageProps.athleteData`) and team **schedules**
(`pageProps.contests`) — arrive as bare positional arrays with the field names
stripped. `src/decode.ts` carries the three key lists lifted verbatim from
MaxPreps' own JS bundle and applies them the way the site does.

**A shifted key list still produces plausible-looking JSON.** Nothing about a
misaligned decode looks wrong on inspection: you get strings where strings belong
and numbers where numbers belong, just attached to the wrong names. So alignment
is never verified by reading the output. It is verified against independent
published values, and both checks live in `tests/decode.test.ts`:

1. Non-deleted roster rows must equal what the page actually renders.
2. Summing decoded per-game scores must reproduce the season totals MaxPreps
   publishes in `standingsData.overallStanding` — record, points for, points
   against — for two different schools, states and sports.

If you touch `decode.ts`, those tests are the gate. Do not relax them to green;
re-derive the key lists from the bundle instead (`docs/MAXPREPS-API.md` has the
extraction commands).

## Data facts that mislead

- `resultString` is **winner-first**: a loss reads `"L 20-13"` when the team
  scored 13. Always expose `teamScore` / `opponentScore` instead.
- `isDeleted` is set on a large minority of roster and contest rows and the site
  hides them. Unfiltered counts are wrong, not thorough.
- An empty current season is normal before opening day — not a failure to report.
- `homeAwayType`: `0` home, `1` away. `classYear`: numeric 9–12.

## Scope

The statewide scoreboard (`/<st>/<sport>/scores/`) has no server-rendered payload;
per-team schedules are the supported route to scores. Don't add a tool that claims
otherwise.

`skills/maxpreps/` is the shell-only equivalent of this server and ships in the
npm package and the plugin. Keep it in step with `docs/MAXPREPS-API.md` when the
upstream shapes change.

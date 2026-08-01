# maxpreps-mcp

MCP server for [MaxPreps](https://www.maxpreps.com) — read any US high school's
team schedules, scores, records, rosters, stat leaders and athlete careers.

> Developed and maintained by AI (Claude Code). Use at your own discretion.

**No account, no API key, no browser extension.** MaxPreps serves its pages with
Next.js, and every public page has a companion JSON route carrying the same data
the page was rendered from. This server reads those routes directly over plain
HTTPS, so it works anywhere Node runs.

## Install

```bash
npx maxpreps-mcp
```

Or add it to an MCP host:

```json
{
  "mcpServers": {
    "maxpreps": {
      "command": "npx",
      "args": ["-y", "maxpreps-mcp"]
    }
  }
}
```

## Tools

All ten are read-only; this server has no write path.

| Tool | What it does |
| --- | --- |
| `maxpreps_search` | Find a school or athlete by name — **start here** |
| `maxpreps_list_teams` | Every team path a school publishes, with sport/gender/level |
| `maxpreps_get_school` | School profile, identifiers, association, nearby schools |
| `maxpreps_get_team` | Season record, standings, rankings, and available seasons |
| `maxpreps_get_schedule` | Games with results and scores, plus a computed record |
| `maxpreps_get_roster` | Players with jersey, class, positions, height, weight |
| `maxpreps_get_stat_leaders` | Statistical leaders with qualifying minimums |
| `maxpreps_get_athlete` | One athlete's career page |
| `maxpreps_healthcheck` | Connectivity plus site build-id resolution |
| `maxpreps_get_page` | Raw page data for anything the above doesn't cover |

### Typical flow

Paths are not guessable, so resolve before you fetch:

1. `maxpreps_search "myers park"` → the school's `canonicalUrl`
2. `maxpreps_list_teams` on that path → real team paths
3. `maxpreps_get_schedule` / `_roster` / `_stat_leaders` on a team path

Prior seasons are a `season` argument (`"25-26"`); roughly 20 years are available.

## Configuration

Everything is optional — the server works with no configuration at all.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAXPREPS_USER_AGENT` | built-in | Override the User-Agent sent to MaxPreps |
| `MAXPREPS_CACHE_TTL` | `300` | Seconds to reuse a fetched page; `0` disables |
| `MAXPREPS_MIN_INTERVAL_MS` | `250` | Minimum spacing between requests |
| `MAXPREPS_TIMEOUT_MS` | `20000` | Per-request timeout |

## Things worth knowing

These are properties of MaxPreps' data, and each one has bitten a naive reading:

- **Scores are winner-first in the raw data.** MaxPreps renders a loss as
  `"L 20-13"` even when the team scored 13. The `teamScore` / `opponentScore`
  fields this server returns are always oriented team-vs-opponent.
- **Rosters and schedules carry hidden rows.** A meaningful minority are flagged
  deleted and the site does not render them — the 2025-26 Myers Park football
  roster has 87 entries behind 63 visible players. They are excluded by default.
- **An out-of-season team is not a broken one.** Before opening day the current
  season legitimately has an empty roster and no results; ask for a prior season.
- **Search is literal.** `"myers park"` finds the school; `"myers park high"`
  finds nothing. Drop qualifiers before concluding a school is absent.
- **Statewide scoreboards aren't available.** `/<st>/<sport>/scores/` renders its
  game list client-side from a route that has no server-rendered payload. Per-team
  schedules are the supported way to get scores.

## Shell-only alternative

The repo also ships a `maxpreps` skill (`skills/maxpreps/`) that reaches the same
data through `curl` + a small decoder, with no server to run. If you only ever use
Claude Code on one machine, the skill alone may be all you need; the MCP server is
what makes this reachable from claude.ai, a phone, or any other client.

## Development

```bash
npm install
npm run build
npm test
```

`docs/MAXPREPS-API.md` pins the captured request/response shapes, the positional
key maps, and how to re-derive them if MaxPreps changes its bundle.

## Etiquette

This reads an undocumented surface on someone else's site on behalf of one user.
Requests are spaced and responses cached by default. Please keep it that way.

## License

MIT

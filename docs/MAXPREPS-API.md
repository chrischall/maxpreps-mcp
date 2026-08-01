# MaxPreps data surface

Reverse-engineered from the live site. Every shape below was captured from a real
response before being coded against; nothing here is inferred from documentation,
because there is none.

**Captured 2026-08-01 against buildId `1785513693`.**

## Transport

MaxPreps is a Next.js pages-router app. Every public page has a companion JSON
route carrying exactly the props the page was server-rendered with:

```
GET https://www.maxpreps.com/_next/data/<buildId>/<path>.json[?<query>]
```

- **No authentication.** No key, no cookie, no bearer, no browser bridge. Plain
  `curl` from a server gets a 200.
- **No bot wall.** No DataDome/PerimeterX/Cloudflare interstitial on these routes;
  a default `curl` User-Agent is served normally.
- The site does expose an internal gateway at
  `https://production.api.maxpreps.com/gatewayweb/react/<endpoint>/v1`. Its client
  passes a `DEFAULT_TOKEN` which the bundle defines as the **empty string**
  (`let t="";e.s(["DEFAULT_TOKEN",0,t],94889)`), confirming public reads need no
  credential. We use the `_next/data` routes instead: they cover more surface and
  return whole pages in one request.

### buildId

`buildId` changes on every site deploy and is embedded in every data URL. Scrape
it from the homepage:

```
"buildId":"1785513693\n"
```

Note the trailing `\n` inside the JSON string — match `"buildId":"([^"\\]+)` so
the escape terminates the capture.

A stale id 404s exactly like a bad path. `MaxPrepsClient` distinguishes them by
re-resolving once and retrying; a second 404 means the path is genuinely wrong.

## Paths

```
<st>/<city>/<school-slug>                       school
<st>/<city>/<school-slug>/<sport>[/<gender>][/<level>]        team (current season)
<st>/<city>/<school-slug>/<sport>.../<yy-yy>/<tab>            team (prior season)
<st>/<city>/<school-slug>/athletes/<slug>?careerid=<id>       athlete
search?q=<query>                                              search
```

Tabs: `schedule`, `roster`, `stats`, `rankings`, `standings`. Omit for the team
home page. The season segment sits **between** the team path and the tab.

**The sport/gender/level segments are not derivable.** The default gender varies
per sport — girls golf is `golf/girls` while boys golf is `golf/spring`, and field
hockey is a girls sport with no gender segment. Always enumerate them from the
school page rather than constructing them.

Roughly 20 years of history is available; Myers Park football goes back to `04-05`.

## Response shapes

### `search?q=`

`initialSchoolResults[]` — `schoolId`, `name`, `city`, `state`, `zip`, `mascot`,
`mascotUrl`, `canonicalUrl`, `ranking`.
`initialCareerResults[]` — `careerId`, `fullName`, `sports[]`, `schoolFormattedName`,
`careerCanonicalUrl` (already carries `?careerid=`).

Search is literal: `"myers park"` matches, `"myers park high"` returns zero.

Some career results are stubs — indexed under a generic `"<School> Athlete"` name,
with a page that carries neither `athleteName` nor `careerContext`.

### Team page

`teamContext.data` — `season`, `year`, `sportSeasonName`, `allSeasonId`, `sportSeasonId`.
`teamContext.standingsData.overallStanding` — `overallWinLossTies`, `points`,
`pointsAgainst`, `homeWinLossTies`, `awayWinLossTies`, `winningPercentage`, `streak`.
`teamContext.standingsData.leagueStanding` — `leagueName`, `conferenceWinLossTies`,
`conferenceStandingPlacement`.
`teamContext.teamSeasonPickerData[]` — every season, with `canonicalUrl` and `year`.

### `stats` tab

`playerStatLeadersData` — `{ leaders[], minimums, lastUpdated }`, all plainly named.

### Not available

`/<st>/<sport>/scores/` (the statewide scoreboard) returns page chrome only. The
game list is hydrated by a route that does not fire server-side, and no XHR to
`production.api.maxpreps.com` was observed on that page. Per-team schedules are
the supported path to scores.

## Positional encoding

Two payloads ship as bare arrays with the field names stripped, rehydrated
client-side by `deserializeObject(keys, row)`, which assigns `a[keys[i]] = row[i]`.

| Payload | Prop | Key list | Fields |
| --- | --- | --- | --- |
| Roster | `pageProps.athleteData` | `GSSP_ROSTER_SERIALIZE_KEYS` | 37 |
| Schedule | `pageProps.contests` | contest list in `deserializeContestList` | 41 |
| Contest team | `contest.currentTeam` / `.opponentTeam` / `.teams[]` | team list, same module | 32 |

The team list repeats `teamId` (indices 1, 25, 28), `sportSeasonId` (2, 27) and
`resultString` (3, 31). Those duplicates are load-bearing for index alignment; the
values are identical in every payload observed, so the last-write-wins collapse is
lossless. `src/decode.ts` reproduces the site's semantics exactly.

### Re-deriving the key lists

If a decode misaligns, MaxPreps changed a key list. Recover it from the bundle:

```bash
# roster
curl -s https://www.maxpreps.com/nc/charlotte/myers-park-mustangs/football/25-26/roster/ \
  | grep -oE 'src="https://asset\.maxpreps\.io/[^"]+\.js"' | sed 's/src="//;s/"$//' \
  | xargs -P8 -n1 curl -s | grep -ohE 'GSSP_ROSTER_SERIALIZE_KEYS",0,\[[^]]*\]'

# contest + team (same pipeline against the schedule page)
... | grep -ohE 'let s=\["id","teamId","sportSeasonId".{0,1200}'
```

### Field semantics worth pinning

- `homeAwayType`: `0` = home, `1` = away. Verified against the site's `vs`/`@`
  rendering across a full season.
- `resultString` is **winner-first**: a loss reads `"L 20-13"` even when the team
  scored 13. Use `currentTeam.score` / `opponentTeam.score` for team-vs-opponent.
- `calculatedTeamContestResult`: `2` = win, `3` = loss.
- `classYear` is numeric 9–12. `formattedClassYear` ships empty; derive the label.
- `isDeleted` is set on a substantial minority of rows and the site hides them —
  the Myers Park 25-26 football roster has 87 entries of which the page renders 63.
  Treat unfiltered counts as wrong.
- `dateCode` / `isDateTba` / `isTimeTba` mark placeholder dates; a `date` value can
  be a placeholder rather than a real kickoff.

## Verifying a decode

A shifted key map still produces plausible JSON, so alignment must be checked
against something independent. Two cross-checks, both encoded as tests:

1. **Roster count** must equal the rows the page renders (63 of 87 for Myers Park
   football 25-26).
2. **Summed per-game scores** must equal the site's own season totals from
   `standingsData.overallStanding`.

| Team | Decoded | Site |
| --- | --- | --- |
| Myers Park football 25-26 | 9-3, 412 / 141 | 9-3, 412 / 141 |
| Mater Dei (CA) basketball 25-26 | 22-16, 2874 / 2592 | 22-16, 2874 / 2592 |

Both held exactly at capture time, on two different schools, states and sports.

## Etiquette

This is an undocumented surface on someone else's site, read on behalf of one
user. The client spaces requests (`MAXPREPS_MIN_INTERVAL_MS`, default 250 ms) and
caches responses (`MAXPREPS_CACHE_TTL`, default 300 s). There is no write path.

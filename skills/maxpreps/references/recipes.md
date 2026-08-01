# MaxPreps recipes

`M=~/.claude/skills/maxpreps/scripts/mpx.mjs`

## Find things

```bash
# schools
node "$M" search "mater dei" | jq -r '.schools[] | "\(.name) (\(.city), \(.state))  \(.canonicalUrl)"'

# athletes — careerCanonicalUrl already carries the ?careerid= the athlete page needs
node "$M" search "brody keefe" | jq -r '.athletes[] | "\(.fullName)  \(.schoolFormattedName)  \(.sports|join(","))  \(.careerCanonicalUrl)"'

# a school's teams, varsity only
node "$M" teams nc/charlotte/myers-park-mustangs \
  | jq -r '.[] | select(.level=="Varsity") | "\(.path)  [\(.gender) \(.sport)]"'

# every season of one team, newest first
node "$M" team nc/charlotte/myers-park-mustangs/football \
  | jq -r '.seasons[] | select(.level=="Varsity") | "\(.year)  \(.canonicalUrl)"'
```

## Schedule and scores

```bash
S=nc/charlotte/myers-park-mustangs/football/25-26/schedule

# one line per game
node "$M" schedule $S | jq -r '.[] | "\(.date[0:10])  \(.homeAway)  \(.result // "—")  \(.teamScore)-\(.opponentScore)  \(.opponent)"'

# record + point differential computed from games
node "$M" schedule $S | jq '{
  W: [.[]|select(.result=="W")]|length,
  L: [.[]|select(.result=="L")]|length,
  pf: [.[].teamScore]|add, pa: [.[].opponentScore]|add }'

# upcoming only
node "$M" schedule $S | jq '[.[] | select(.hasResult|not)]'
```

Cross-check against the site's own totals — they must agree:

```bash
node "$M" team nc/charlotte/myers-park-mustangs/football/25-26 | jq '.standings.overallStanding'
# { overallWinLossTies: "9-3", points: 412, pointsAgainst: 141, homeWinLossTies: "4-1", ... }
```

`.standings.leagueStanding` adds `leagueName`, `conferenceWinLossTies`, `conferenceStandingPlacement`.

## Roster

```bash
R=nc/charlotte/myers-park-mustangs/football/25-26/roster

node "$M" roster $R | jq -r '.[] | "#\(.jersey)  \(.name)  \(.classYearLabel)  \(.positions)  \(.height // "—")  \(.weight // "—") lbs"'

node "$M" roster $R | jq 'group_by(.classYearLabel) | map({class: .[0].classYearLabel, n: length})'
node "$M" roster $R | jq '[.[] | select(.hasStats)] | length'   # who has stats pages
```

## Stat leaders

```bash
node "$M" stats nc/charlotte/myers-park-mustangs/football/25-26/stats \
  | jq -r '.leaders[] | "\(.athleteFirstName) \(.athleteLastName)  \(.stat.displayName): \(.stat.value)"'
```

`.minimums` lists the qualifying thresholds; `.lastUpdated` is the stat refresh time.

## Athlete career

```bash
node "$M" athlete "nc/charlotte/myers-park-mustangs/athletes/brody-keefe?careerid=c35dcsgih39sc" \
  | jq '{name, availability}'
```

`.history` is an array of season entries; `.cards` holds the rendered career highlights.

## Anything else

Any public page has a JSON twin. Use `raw` and explore:

```bash
node "$M" raw nc/charlotte/myers-park-mustangs/football/25-26/standings | jq 'keys'
node "$M" raw nc/charlotte/myers-park-mustangs/football/25-26/rankings | jq '.rankingsData'
```

Confirmed extra tabs: `standings` (`standingsData`, `leaderStats`), `rankings`
(`rankingsData`, `historicalRankingsData`). Both are plain named JSON — no decoding needed.

---

# Positional encoding

Two payloads ship as bare arrays with the field names stripped: `pageProps.athleteData`
(roster) and `pageProps.contests` (schedule). The site rehydrates them with

```js
deserializeObject(keys, row)  // a[keys[i]] = row[i]
```

`mpx.mjs` carries the three key lists lifted verbatim from the site bundle and applies the
same rule, **including the duplicate keys** in the team list (indices 25/27/28/31 repeat
earlier names; the values are identical, so last-write-wins loses nothing).

- `ROSTER_KEYS` — 37 fields, from `GSSP_ROSTER_SERIALIZE_KEYS`
- `CONTEST_KEYS` — 41 fields, `TEAM_KEYS` — 32 fields, from `deserializeContestList`

If a decode ever comes out misaligned, the site changed its key list. Re-derive it:

```bash
curl -s https://www.maxpreps.com/nc/charlotte/myers-park-mustangs/football/25-26/roster/ \
  | grep -oE 'src="https://asset\.maxpreps\.io/[^"]+\.js"' | sed 's/src="//;s/"$//' \
  | xargs -P8 -n1 curl -s | grep -ohE 'GSSP_ROSTER_SERIALIZE_KEYS",0,\[[^]]*\]'
```

The contest lists live in the schedule page's chunks under `deserializeContestList` —
search those chunks for `let s=["id","teamId","sportSeasonId"`.

## Verifying a decode

Field alignment is silent when it breaks — a shifted key map still produces plausible JSON.
Check against something independent:

- Roster row count must equal the rendered table's rows (63 for MP football 25-26; the
  other 24 of 87 are `isDeleted`).
- Summed per-game scores must equal `.standings.overallStanding.points` /
  `.pointsAgainst` (412 / 141), and the W/L tally must equal `overallWinLossTies` (`9-3`).

Both held exactly when this skill was written.

# Field notes

- `homeAwayType` `0`=home `1`=away · `calculatedTeamContestResult` `2`=win `3`=loss
- `classYear` `9`–`12`; `formattedClassYear` is empty in the payload, so `mpx` derives `classYearLabel`
- `contestState` distinguishes scheduled / in-progress / boxscore / score-not-reported
- `dateCode` flags TBA: date-TBA and time-TBA are separate states, so a `date` can be a placeholder — check `isDateTba` / `isTimeTba` before presenting a time
- Contests carry `goFanUrl` / `nfhsStreamUrl` (tickets, streams) when the school is a partner
- School ids, team ids, and sport-season ids are GUIDs; `careerid` in athlete URLs is a short base-36 code, not a GUID

import { describe, it, expect, afterAll } from 'vitest';
import { registerSearchTools } from '../src/tools/search.js';
import { registerSchoolTools } from '../src/tools/school.js';
import { registerTeamTools } from '../src/tools/team.js';
import { registerScheduleTools } from '../src/tools/schedule.js';
import { registerRosterTools } from '../src/tools/roster.js';
import { registerStatsTools } from '../src/tools/stats.js';
import { registerAthleteTools } from '../src/tools/athlete.js';
import { registerRankingsTools } from '../src/tools/rankings.js';
import { registerStandingsTools } from '../src/tools/standings.js';
import { registerUtilityTools } from '../src/tools/utilities.js';
import { createTestHarness } from './helpers.js';

const registerAll = (server: Parameters<typeof registerSearchTools>[0]) => {
  registerSearchTools(server);
  registerSchoolTools(server);
  registerTeamTools(server);
  registerScheduleTools(server);
  registerRosterTools(server);
  registerStatsTools(server);
  registerAthleteTools(server);
  registerRankingsTools(server);
  registerStandingsTools(server);
  registerUtilityTools(server);
};

describe('tool registry', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('registers exactly the expected roster', async () => {
    harness = await createTestHarness(registerAll);
    const tools = await harness.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'maxpreps_search',
        'maxpreps_get_school',
        'maxpreps_list_teams',
        'maxpreps_get_team',
        'maxpreps_get_schedule',
        'maxpreps_get_roster',
        'maxpreps_get_stat_leaders',
        'maxpreps_get_athlete',
        'maxpreps_healthcheck',
        'maxpreps_get_page',
        'maxpreps_get_rankings',
        'maxpreps_get_team_rankings',
        'maxpreps_get_standings',
      ].sort(),
    );
  });

  // `harness.listTools()` projects to names only, so go through the client for
  // the full descriptors.
  const fullTools = async () => (await harness.client.listTools()).tools;

  it('marks every tool read-only — this server has no write path', async () => {
    const mutating = (await fullTools()).filter((t) => t.annotations?.readOnlyHint !== true);
    expect(mutating.map((t) => t.name)).toEqual([]);
  });

  it('never asks for a confirm flag, since nothing mutates', async () => {
    const confirmable = (await fullTools()).filter(
      (t) => 'confirm' in ((t.inputSchema?.properties ?? {}) as Record<string, unknown>),
    );
    expect(confirmable.map((t) => t.name)).toEqual([]);
  });

  it('gives every tool a description that names its inputs', async () => {
    const thin = (await fullTools()).filter((t) => (t.description ?? '').length < 80);
    expect(thin.map((t) => t.name)).toEqual([]);
  });
});

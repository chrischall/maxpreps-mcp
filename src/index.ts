#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';
import { registerSearchTools } from './tools/search.js';
import { registerSchoolTools } from './tools/school.js';
import { registerTeamTools } from './tools/team.js';
import { registerScheduleTools } from './tools/schedule.js';
import { registerRosterTools } from './tools/roster.js';
import { registerStatsTools } from './tools/stats.js';
import { registerAthleteTools } from './tools/athlete.js';
import { registerRankingsTools } from './tools/rankings.js';
import { registerStandingsTools } from './tools/standings.js';
import { registerUtilityTools } from './tools/utilities.js';

// MaxPreps needs no credentials, so there is no deferred config error to carry:
// the client is a module-level singleton imported by each tool module, and every
// tool works as soon as the server boots.
await runMcp({
  name: 'maxpreps-mcp',
  version: VERSION,
  banner:
    '[maxpreps-mcp] This project was developed and is maintained by AI. Use at your own discretion.',
  tools: [
    registerSearchTools,
    registerSchoolTools,
    registerTeamTools,
    registerScheduleTools,
    registerRosterTools,
    registerStatsTools,
    registerAthleteTools,
    registerRankingsTools,
    registerStandingsTools,
    registerUtilityTools,
  ],
});

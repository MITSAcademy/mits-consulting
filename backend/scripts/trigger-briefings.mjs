// Trigger evening briefings for Team 1 and Team 2
// Run: node --loader ts-node/esm scripts/trigger-briefings.mjs
// OR compile first via ts-node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env
process.env.DATABASE_URL = 'postgresql://mits:xDToxYfcEnPGBal8pVqbRVGQrQJ6PA1a@dpg-d87hlsl7vvec7392tbc0-a.oregon-postgres.render.com/mits';

const { sendTeam1Briefing, sendTeam2Briefing } = require('../dist/lib/dailyBriefing.js');

console.log('Sending Team 1 evening briefing...');
await sendTeam1Briefing('evening').catch(e => console.error('Team 1 failed:', e.message));
console.log('Team 1 done.');

console.log('Sending Team 2 evening briefing...');
await sendTeam2Briefing('evening').catch(e => console.error('Team 2 failed:', e.message));
console.log('Team 2 done.');

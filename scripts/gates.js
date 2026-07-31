// Runs every post-deploy gate and aggregates the result.
//
// WHY THIS EXISTS
// The deploy script used to chain them with &&:
//
//   ... && vercel deploy --prod && verify-live.js && e2e-render.js
//
// which means the FIRST failing gate hides every gate after it. That bit
// immediately: verify-live started failing on a real (but pre-existing) database
// problem, and the consequence was that e2e-render silently stopped running -
// the one gate that exists because the app once shipped completely broken to
// 100% of users while verify-live passed 14/14.
//
// A failing gate must never suppress another gate's verdict. Both always run,
// both always report, and the exit code reflects all of them.
//
// Usage:  node scripts/gates.js        (or npm run gates)

const { spawnSync } = require('child_process');
const path = require('path');

const GATES = [
  { name: 'verify-live', script: 'verify-live.js' },
  { name: 'e2e-render', script: 'e2e-render.js' },
  // Real microphone capture in a real browser. This gate exists because a
  // Permissions-Policy header of microphone=() shipped the entire sound feature
  // dead while every other check passed: the host, the API and the recorder were
  // all verified with PRE-RECORDED audio, so nothing ever asked a browser for a
  // microphone. Chrome's --use-fake-device-for-media-stream makes that askable in
  // CI.
  { name: 'e2e-mic', script: 'e2e-mic.js' },
];

const outcomes = [];

for (const gate of GATES) {
  const result = spawnSync(process.execPath, [path.join(__dirname, gate.script)], {
    stdio: 'inherit',
    // A gate that hangs must not hang the deploy forever. e2e-render drives a
    // real browser and is the slow one; 6 minutes is far beyond its normal
    // runtime (~40s) while still being a bound.
    timeout: 6 * 60 * 1000,
  });

  let status;
  if (result.error && result.error.code === 'ETIMEDOUT') status = 'TIMEOUT';
  else if (result.error) status = `ERROR (${result.error.message})`;
  else status = result.status === 0 ? 'PASS' : 'FAIL';

  outcomes.push({ name: gate.name, status, ok: status === 'PASS' });
}

const failed = outcomes.filter((o) => !o.ok);

console.log('\n' + '='.repeat(52));
console.log('  PORTOES DE DEPLOY');
console.log('='.repeat(52));
for (const o of outcomes) {
  console.log(`  ${o.ok ? 'PASS' : 'FAIL'}  ${o.name}${o.ok ? '' : ' -> ' + o.status}`);
}
console.log('='.repeat(52) + '\n');

if (failed.length) {
  console.error(`${failed.length} portao(oes) falhou: ${failed.map((o) => o.name).join(', ')}\n`);
  process.exit(1);
}
console.log('Todos os portoes passaram.\n');

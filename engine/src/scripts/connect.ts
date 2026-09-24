// Step 1: check that Viseca's API answers and show our team's settings.
import { viseca } from "../viseca.js";

const health = await viseca.health();
if (!health.ok) {
  console.error(`✕ Viseca not reachable (HTTP ${health.status})`);
  process.exit(1);
}

const boot = await viseca.bootstrap();
if (!boot.ok) {
  console.error(`✕ Viseca answered, but our team key was refused (HTTP ${boot.status})`);
  process.exit(1);
}

const b = boot.data;
console.log(`Connected ✓  ${health.data.service} · API ${b.api_version} · data ${b.pack_version} · ${b.team_id}`);
console.log(
  `Decision deadline ${b.limits.decision_timeout_seconds} s · customer answer window ${b.limits.step_up_timeout_seconds} s · ` +
    `long poll ${b.limits.long_poll_max_seconds} s · reset ${b.features.reset ? "on" : "off"}`,
);
console.log(`\n${b.scenarios.length} live stories:`);
for (const s of b.scenarios) {
  console.log(`  ${s.scenario_id}  ${s.scenario_name.padEnd(32)} ${String(s.event_count).padStart(2)} purchases`);
}

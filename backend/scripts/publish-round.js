#!/usr/bin/env node
/**
 * scripts/publish-round.js
 *
 * Runs the three commands that close a round, in the order they must run:
 *
 *   import-ranked-boards.js   → backend/standings/<boardId>.json
 *   generate-standings-cards.js → content-registry.json + standings.json
 *   generate-methodology.js   → methodology.json
 *
 * WHY A WRAPPER AND NOT A CHECKLIST:
 *   These three never run in a different order and never run alone, and
 *   generate-methodology.js is the one people forget — which leaves the site
 *   describing the previous round's rules while the standings are current. A
 *   step that cannot be skipped beats a checklist item that can be ticked
 *   without being done.
 *
 * IT DOES NOT SWALLOW OUTPUT.
 *   Each step inherits stdio, so every JSON log line still reaches the
 *   terminal. Those lines are the audit trail — a wrapper that hid them for a
 *   tidier terminal would trade away the thing that makes the pipeline
 *   checkable.
 *
 * IT STOPS AT THE FIRST FAILURE.
 *   A refused import must not flow into published artifacts. Any non-zero exit
 *   ends the run with that step's own exit code.
 *
 * --from standings
 *   Skips the import. Not a nicety: a hand-written one-off contest has no
 *   export to import, so without this the wrapper cannot be used for one.
 *
 * Any other flags are passed through to every step, so --allow-incomplete
 * still reaches generate-standings-cards.js.
 *
 * Exit codes:
 *   0 = all steps succeeded
 *   n = the exit code of the first step that failed
 *
 * Usage:
 *   node backend/scripts/publish-round.js
 *   node backend/scripts/publish-round.js --from standings
 *   node backend/scripts/publish-round.js --allow-incomplete
 */
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPTS_DIR = __dirname;

const STEPS = [
  { key: "import", script: "import-ranked-boards.js", label: "import ranked boards" },
  { key: "standings", script: "generate-standings-cards.js", label: "generate standings cards" },
  { key: "methodology", script: "generate-methodology.js", label: "generate methodology" },
];

function fail(message, hint) {
  process.stderr.write(`\n✗ ${message}\n`);
  if (hint) process.stderr.write(`${hint}\n`);
  process.stderr.write("\n");
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    process.stderr.write(
      "\nUsage: node backend/scripts/publish-round.js [--from <step>] [passthrough flags]\n" +
      `       steps: ${STEPS.map((s) => s.key).join(", ")}\n\n`
    );
    process.exit(0);
  }

  // --from <step>: start there instead of at the beginning.
  let startIndex = 0;
  const fromAt = args.indexOf("--from");
  if (fromAt !== -1) {
    const wanted = args[fromAt + 1];
    startIndex = STEPS.findIndex((s) => s.key === wanted);
    if (startIndex === -1) {
      fail(
        `Unknown --from step "${wanted}".`,
        `Expected one of: ${STEPS.map((s) => s.key).join(", ")}`
      );
    }
    args.splice(fromAt, 2);
  }

  const passthrough = args;
  const planned = STEPS.slice(startIndex);

  process.stderr.write(`\n  publish-round: ${planned.map((s) => s.key).join(" → ")}\n`);
  if (startIndex > 0) {
    process.stderr.write(`  skipping: ${STEPS.slice(0, startIndex).map((s) => s.key).join(", ")}\n`);
  }
  process.stderr.write("\n");

  planned.forEach((step, i) => {
    process.stderr.write(`── ${i + 1}/${planned.length}  ${step.label} ──\n`);

    const result = spawnSync(
      process.execPath,
      [path.join(SCRIPTS_DIR, step.script), ...passthrough],
      { stdio: "inherit" }
    );

    if (result.error) {
      fail(`Could not run ${step.script}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const remaining = planned.length - i - 1;
      const tail = remaining === 0
        ? "It was the last step, so earlier steps did run — check what they wrote before re-running."
        : `Stopping: ${remaining} later step${remaining === 1 ? "" : "s"} did not run, ` +
          "so nothing downstream was published from a failed step.";
      process.stderr.write(`\n✗ ${step.label} failed (exit ${result.status}). ${tail}\n\n`);
      process.exit(result.status);
    }
    process.stderr.write("\n");
  });

  process.stderr.write("  publish-round: all steps succeeded.\n");
  process.stderr.write("  Next: review the diff, commit, push — then compose-post.js contest-result.\n\n");
}

main();

import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

import {
  hasRulesBlock,
  installRulesIntoAgentsMd,
  removeRulesBlockFromAgentsMd,
} from "../out/agentsMd.js";
import {
  PARALLEL_MODE_MARKERS,
  disableParallelMode,
  enableParallelMode,
  isParallelModeEnabled,
} from "../out/parallelMode.js";
import {
  disableSubagentMode,
  enableSubagentMode,
  isSubagentModeEnabled,
} from "../out/subagentMode.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parallelBundleDir = path.join(repoRoot, "bundled", "parallel-mode");
const subagentBundleDir = path.join(repoRoot, "bundled", "subagent-mode");
const ruleBundleDir = path.join(repoRoot, "bundled", "ai-rules");

async function withRoot(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "airules-parallel-"));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

const readAgentsMd = (root) => fs.readFile(path.join(root, "AGENTS.md"), "utf8");
const enable = (root, testCommand = "npm test") => enableParallelMode(root, parallelBundleDir, testCommand);
const enableSubagent = (root, testCommand = "npm test") =>
  enableSubagentMode(root, subagentBundleDir, testCommand);

describe("enableParallelMode", () => {
  test("is off until enabled, then writes one block into AGENTS.md and nothing else", async () => {
    await withRoot(async (root) => {
      assert.equal(await isParallelModeEnabled(root), false);

      assert.deepEqual(await enable(root), { created: true });

      assert.equal(await isParallelModeEnabled(root), true);
      assert.equal(PARALLEL_MODE_MARKERS.start, "<!-- ai-rulebook:parallel-mode:start -->");
      assert.equal(PARALLEL_MODE_MARKERS.end, "<!-- ai-rulebook:parallel-mode:end -->");
      assert.deepEqual(await fs.readdir(root), ["AGENTS.md"], "no per-tool folders or settings");
      const text = await readAgentsMd(root);
      assert.ok(text.startsWith(`# AGENTS.md\n\n${PARALLEL_MODE_MARKERS.start}\n`));
      assert.ok(text.endsWith(`${PARALLEL_MODE_MARKERS.end}\n`));
      assert.match(text, /^## Fast parallel agent mode$/m);
      assert.doesNotMatch(text, /^# Fast parallel/m, "the section nests under the file title");
      assert.match(text, /`npm test`/);
      assert.doesNotMatch(text, /\{\{/);
    });
  });

  test("falls back to prose when the project's test command is unknown", async () => {
    await withRoot(async (root) => {
      await enable(root, null);
      const text = (await readAgentsMd(root)).replace(/\s+/g, " ");

      assert.match(text, /Run the full check once on the combined result: the project's test command, plus/);
      assert.doesNotMatch(text, /\{\{/);
    });
  });

  test("tells the orchestrator to split, contract, fan out, isolate, verify, cap repairs, and review", async () => {
    await withRoot(async (root) => {
      await enable(root);
      const text = (await readAgentsMd(root)).replace(/\s+/g, " ");

      assert.match(text, /Apply this section only when your tool can run subagents in parallel/);
      assert.match(text, /Split by file ownership: every file that will change belongs to exactly one unit/);
      assert.match(text, /Write a shared contract before fan-out/);
      assert.match(text, /Spawn every ready unit in a single message so they run at the same time/);
      assert.match(text, /Two units must never edit the same file in the same checkout/);
      assert.match(text, /give each unit its own git worktree/);
      assert.match(text, /isolation: "worktree"/);
      assert.match(text, /Run the full check once on the combined result: `npm test`/);
      assert.match(text, /Passing unit checks do not prove the whole passes/);
      assert.match(text, /Allow at most two repair rounds, then stop and report what still fails and why/);
      assert.match(text, /Never spawn a third delegate for the same unit/);
      assert.match(text, /this review is not optional/);
      assert.match(text, /read the final diff yourself/);
    });
  });

  test("caps concurrency, allows falling back, and integrates worktree units one at a time", async () => {
    await withRoot(async (root) => {
      await enable(root);
      const text = (await readAgentsMd(root)).replace(/\s+/g, " ");

      assert.match(text, /Run at most five units at once/);
      assert.match(text, /Fall back when fan-out stops paying/);
      assert.match(text, /stop spawning and finish the remaining work yourself/);
      assert.match(text, /bring worktree units into the main checkout one at a time/);
      assert.match(text, /run its check there before taking the next/);
      assert.match(text, /Resolve a conflict yourself against the contract; never silently drop either side/);
      assert.match(text, /Remove each worktree once its changes are in/);
    });
  });

  test("carries the implementer, researcher, and reviewer delegate contracts", async () => {
    await withRoot(async (root) => {
      await enable(root);
      const text = (await readAgentsMd(root)).replace(/\s+/g, " ");
      const raw = await readAgentsMd(root);

      for (const role of ["Implementer", "Researcher", "Reviewer"]) {
        assert.match(raw, new RegExp(`^- ${role}: `, "m"), `${role} contract`);
      }
      assert.match(text, /Implementer: edit only the files your unit owns and build to the contract/);
      assert.match(text, /reply `BLOCKED:` with the one question that unblocks you/);
      assert.match(text, /Researcher: read and search only, and edit nothing/);
      assert.match(text, /Look hardest at the seams between units/);
      assert.match(text, /or exactly `NO FINDINGS`/);
      assert.doesNotMatch(text, /\.claude|\.codex|\.cursor/, "the text must not point at per-tool folders");
    });
  });

  test("re-enabling refreshes the block in place instead of adding a second one", async () => {
    await withRoot(async (root) => {
      await enable(root, null);
      assert.deepEqual(await enable(root, "cargo test"), { created: false });

      const text = await readAgentsMd(root);
      assert.equal(text.split(PARALLEL_MODE_MARKERS.start).length, 2);
      assert.equal(text.split(PARALLEL_MODE_MARKERS.end).length, 2);
      assert.match(text, /`cargo test`/);
    });
  });

  test("keeps the user's text and stays independent of the rule pack block", async () => {
    await withRoot(async (root) => {
      await fs.writeFile(path.join(root, "AGENTS.md"), "# Mine\n\nHouse rules.\n");
      await enable(root);
      await installRulesIntoAgentsMd(root, ruleBundleDir, ["scope.mdc"], null);

      assert.ok((await readAgentsMd(root)).startsWith("# Mine\n\nHouse rules.\n"));
      assert.equal(await isParallelModeEnabled(root), true);
      assert.equal(await hasRulesBlock(root), true);

      await enable(root, "make test");
      assert.equal(await hasRulesBlock(root), true, "refreshing the mode leaves the pack alone");

      assert.deepEqual(await removeRulesBlockFromAgentsMd(root), { removed: true, deletedFile: false });
      assert.equal(await isParallelModeEnabled(root), true, "removing the pack leaves the mode alone");

      assert.deepEqual(await disableParallelMode(root), { removed: true, deletedFile: false });
      assert.equal(await readAgentsMd(root), "# Mine\n\nHouse rules.\n");
    });
  });

  test("refuses damaged block markers without rewriting the file", async () => {
    await withRoot(async (root) => {
      const damaged = `# Mine\n\n${PARALLEL_MODE_MARKERS.start}\n\nhalf a block\n`;
      await fs.writeFile(path.join(root, "AGENTS.md"), damaged);

      for (const attempt of [enable, isParallelModeEnabled, disableParallelMode]) {
        await assert.rejects(attempt(root), /damaged ai-rulebook:parallel-mode markers/);
      }
      assert.equal(await readAgentsMd(root), damaged);
    });
  });

  test("reports a bundle it cannot read or fully render before writing", async () => {
    await withRoot(async (root) => {
      const brokenBundle = path.join(root, "bundle");
      await fs.cp(parallelBundleDir, brokenBundle, { recursive: true });
      await fs.appendFile(path.join(brokenBundle, "section.md"), "\nUse {{MYSTERY}}.\n");
      const workspace = path.join(root, "workspace");
      await fs.mkdir(workspace);

      await assert.rejects(
        enableParallelMode(workspace, brokenBundle, null),
        /section\.md has an unknown placeholder \{\{MYSTERY\}\}/
      );
      await assert.rejects(enableParallelMode(workspace, path.join(root, "missing"), null), (error) => {
        assert.match(error.message, /Failed to read bundled fast parallel agent mode file section\.md/);
        assert.equal(error.cause.code, "ENOENT");
        return true;
      });
      assert.deepEqual(await fs.readdir(workspace), []);
    });
  });
});

describe("disableParallelMode", () => {
  test("deletes an AGENTS.md that held nothing but the mode", async () => {
    await withRoot(async (root) => {
      await enable(root);

      assert.deepEqual(await disableParallelMode(root), { removed: true, deletedFile: true });
      assert.deepEqual(await fs.readdir(root), []);
    });
  });

  test("reports nothing to do where the mode was never enabled", async () => {
    await withRoot(async (root) => {
      assert.deepEqual(await disableParallelMode(root), { removed: false, deletedFile: false });
      await fs.writeFile(path.join(root, "AGENTS.md"), "# Mine\n");
      assert.deepEqual(await disableParallelMode(root), { removed: false, deletedFile: false });
      assert.equal(await readAgentsMd(root), "# Mine\n");
    });
  });
});

describe("mutual exclusion with token-efficient subagent mode", () => {
  test("parallel mode cannot be enabled while subagent mode is on, and the file is untouched", async () => {
    await withRoot(async (root) => {
      await enableSubagent(root);
      const before = await fs.readFile(path.join(root, "AGENTS.md"));

      await assert.rejects(
        enable(root),
        /fast parallel agent mode can't be enabled while token-efficient subagent mode is on/
      );

      assert.deepEqual(await fs.readFile(path.join(root, "AGENTS.md")), before, "byte-identical");
      assert.equal(await isParallelModeEnabled(root), false);
      assert.equal(await isSubagentModeEnabled(root), true);
    });
  });

  test("subagent mode cannot be enabled while parallel mode is on, and the file is untouched", async () => {
    await withRoot(async (root) => {
      await enable(root);
      const before = await fs.readFile(path.join(root, "AGENTS.md"));

      await assert.rejects(
        enableSubagent(root),
        /token-efficient subagent mode can't be enabled while fast parallel agent mode is on/
      );

      assert.deepEqual(await fs.readFile(path.join(root, "AGENTS.md")), before, "byte-identical");
      assert.equal(await isSubagentModeEnabled(root), false);
      assert.equal(await isParallelModeEnabled(root), true);
    });
  });

  test("the message names the command that turns the other mode off", async () => {
    await withRoot(async (root) => {
      await enableSubagent(root);

      await assert.rejects(enable(root), /AI Rulebook: Disable token-efficient subagent mode/);
    });
  });

  test("enabling succeeds once the other mode is disabled, in both directions", async () => {
    await withRoot(async (root) => {
      await enableSubagent(root);
      await assert.rejects(enable(root), /can't be enabled while/);
      await disableSubagentMode(root);

      assert.deepEqual(await enable(root), { created: true });
      assert.equal(await isParallelModeEnabled(root), true);

      await assert.rejects(enableSubagent(root), /can't be enabled while/);
      await disableParallelMode(root);

      assert.deepEqual(await enableSubagent(root), { created: true });
      assert.equal(await isSubagentModeEnabled(root), true);
      assert.equal(await isParallelModeEnabled(root), false);
    });
  });

  test("refreshing the mode that is already on is not a conflict", async () => {
    await withRoot(async (root) => {
      await enable(root);

      assert.deepEqual(await enable(root, "make test"), { created: false });
    });
  });
});

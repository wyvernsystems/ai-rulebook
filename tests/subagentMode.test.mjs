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
  SUBAGENT_MODE_MARKERS,
  disableSubagentMode,
  enableSubagentMode,
  isSubagentModeEnabled,
} from "../out/subagentMode.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modeBundleDir = path.join(repoRoot, "bundled", "subagent-mode");
const ruleBundleDir = path.join(repoRoot, "bundled", "ai-rules");

async function withRoot(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "airules-subagent-"));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

const readAgentsMd = (root) => fs.readFile(path.join(root, "AGENTS.md"), "utf8");
const enable = (root, testCommand = "npm test") => enableSubagentMode(root, modeBundleDir, testCommand);

describe("enableSubagentMode", () => {
  test("is off until enabled, then writes one block into AGENTS.md and nothing else", async () => {
    await withRoot(async (root) => {
      assert.equal(await isSubagentModeEnabled(root), false);

      assert.deepEqual(await enable(root), { created: true });

      assert.equal(await isSubagentModeEnabled(root), true);
      assert.deepEqual(await fs.readdir(root), ["AGENTS.md"], "no per-tool folders or settings");
      const text = await readAgentsMd(root);
      assert.ok(text.startsWith(`# AGENTS.md\n\n${SUBAGENT_MODE_MARKERS.start}\n`));
      assert.ok(text.endsWith(`${SUBAGENT_MODE_MARKERS.end}\n`));
      assert.match(text, /^## Token-efficient subagent mode$/m);
      assert.doesNotMatch(text, /^# Token-efficient/m, "the section nests under the file title");
      assert.match(text, /the default is\s+`npm test`/);
      assert.doesNotMatch(text, /\{\{/);
    });
  });

  test("falls back to prose when the project's test command is unknown", async () => {
    await withRoot(async (root) => {
      await enable(root, null);

      assert.match(await readAgentsMd(root), /the default is\s+the project's test command\./);
    });
  });

  test("works for any tool: model tiers, substitutes, and delegate contracts live in the text", async () => {
    await withRoot(async (root) => {
      await enable(root);
      const text = await readAgentsMd(root);

      assert.match(text, /Apply this section only when your tool can delegate work to subagents/);
      for (const tier of ["fast", "standard", "deep"]) {
        assert.match(text, new RegExp(`^\\| ${tier} \\|`, "m"), `${tier} tier row`);
      }
      assert.match(text, /- fast: use standard, then the session model\./);
      assert.match(text, /- standard: use the session model\./);
      assert.match(text, /- deep: use the session model when it is at least standard tier/);
      assert.match(text, /Never substitute a model more expensive than the session model\./);
      assert.match(text, /in Claude Code, pass `model`\s+on the Agent call/);
      for (const role of ["Implementer", "Test runner", "Reviewer"]) {
        assert.match(text, new RegExp(`^- ${role}: `, "m"), `${role} contract`);
      }
      assert.doesNotMatch(text, /\.claude|\.codex|\.cursor/, "the text must not point at per-tool folders");
    });
  });

  test("limits retries and says when to review, so failures do not become delegate loops", async () => {
    await withRoot(async (root) => {
      await enable(root);
      const text = (await readAgentsMd(root)).replace(/\s+/g, " ");

      assert.match(text, /When a delegate's edit is wrong or its check fails, fix it yourself instead of spawning another delegate/);
      assert.match(text, /Resend a corrected spec once after a `BLOCKED:` reply, then do the work yourself\./);
      assert.match(text, /Never spawn a third delegate for the same change\./);
      assert.match(text, /Review once, at the end: after the checks pass and before the final report/);
      assert.match(text, /Before the final report, read the final diff once yourself\./);
      assert.doesNotMatch(text, /Route fixes back through an implementer/);
    });
  });

  test("re-enabling refreshes the block in place instead of adding a second one", async () => {
    await withRoot(async (root) => {
      await enable(root, null);
      assert.deepEqual(await enable(root, "cargo test"), { created: false });

      const text = await readAgentsMd(root);
      assert.equal(text.split(SUBAGENT_MODE_MARKERS.start).length, 2);
      assert.match(text, /`cargo test`/);
    });
  });

  test("keeps the user's text and stays independent of the rule pack block", async () => {
    await withRoot(async (root) => {
      await fs.writeFile(path.join(root, "AGENTS.md"), "# Mine\n\nHouse rules.\n");
      await enable(root);
      await installRulesIntoAgentsMd(root, ruleBundleDir, ["scope.mdc"], null);

      assert.ok((await readAgentsMd(root)).startsWith("# Mine\n\nHouse rules.\n"));
      assert.equal(await isSubagentModeEnabled(root), true);
      assert.equal(await hasRulesBlock(root), true);

      await enable(root, "make test");
      assert.equal(await hasRulesBlock(root), true, "refreshing the mode leaves the pack alone");

      assert.deepEqual(await removeRulesBlockFromAgentsMd(root), { removed: true, deletedFile: false });
      assert.equal(await isSubagentModeEnabled(root), true, "removing the pack leaves the mode alone");

      assert.deepEqual(await disableSubagentMode(root), { removed: true, deletedFile: false });
      assert.equal(await readAgentsMd(root), "# Mine\n\nHouse rules.\n");
    });
  });

  test("refuses damaged block markers without rewriting the file", async () => {
    await withRoot(async (root) => {
      const damaged = `# Mine\n\n${SUBAGENT_MODE_MARKERS.start}\n\nhalf a block\n`;
      await fs.writeFile(path.join(root, "AGENTS.md"), damaged);

      for (const attempt of [enable, isSubagentModeEnabled, disableSubagentMode]) {
        await assert.rejects(attempt(root), /damaged ai-rulebook:subagent-mode markers/);
      }
      assert.equal(await readAgentsMd(root), damaged);
    });
  });

  test("reports a bundle it cannot read or fully render before writing", async () => {
    await withRoot(async (root) => {
      const brokenBundle = path.join(root, "bundle");
      await fs.cp(modeBundleDir, brokenBundle, { recursive: true });
      await fs.appendFile(path.join(brokenBundle, "section.md"), "\nUse {{MYSTERY}}.\n");
      const workspace = path.join(root, "workspace");
      await fs.mkdir(workspace);

      await assert.rejects(
        enableSubagentMode(workspace, brokenBundle, null),
        /section\.md has an unknown placeholder \{\{MYSTERY\}\}/
      );
      await assert.rejects(enableSubagentMode(workspace, path.join(root, "missing"), null), (error) => {
        assert.match(error.message, /Failed to read bundled subagent mode file section\.md/);
        assert.equal(error.cause.code, "ENOENT");
        return true;
      });
      assert.deepEqual(await fs.readdir(workspace), []);
    });
  });
});

describe("disableSubagentMode", () => {
  test("deletes an AGENTS.md that held nothing but the mode", async () => {
    await withRoot(async (root) => {
      await enable(root);

      assert.deepEqual(await disableSubagentMode(root), { removed: true, deletedFile: true });
      assert.deepEqual(await fs.readdir(root), []);
    });
  });

  test("reports nothing to do where the mode was never enabled", async () => {
    await withRoot(async (root) => {
      assert.deepEqual(await disableSubagentMode(root), { removed: false, deletedFile: false });
      await fs.writeFile(path.join(root, "AGENTS.md"), "# Mine\n");
      assert.deepEqual(await disableSubagentMode(root), { removed: false, deletedFile: false });
      assert.equal(await readAgentsMd(root), "# Mine\n");
    });
  });
});

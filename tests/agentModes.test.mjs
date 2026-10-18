import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

import { hasRulesBlock, installRulesIntoAgentsMd } from "../out/agentsMd.js";
import {
  PARALLEL_MODE,
  SUBAGENT_MODE,
  activeAgentModes,
  enableAgentMode,
  switchAgentMode,
} from "../out/agentModes.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundles = {
  subagent: path.join(repoRoot, "bundled", "subagent-mode"),
  parallel: path.join(repoRoot, "bundled", "parallel-mode"),
};
const ruleBundleDir = path.join(repoRoot, "bundled", "ai-rules");

async function withRoot(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "airules-modes-"));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

const agentsPath = (root) => path.join(root, "AGENTS.md");
const readAgentsMd = (root) => fs.readFile(agentsPath(root), "utf8");
const exists = (p) =>
  fs.access(p).then(
    () => true,
    () => false
  );
const count = (text, needle) => text.split(needle).length - 1;
const target = (mode, bundleDir = bundles[mode.id], testCommand = "npm test") => ({
  mode,
  bundleDir,
  testCommand,
});
const ids = (modes) => modes.map((m) => m.id);

/** Hand-written AGENTS.md with user text and both mode blocks, as an outside edit could leave it. */
const bothBlocks = (modes = [SUBAGENT_MODE, PARALLEL_MODE]) =>
  "# Mine\n\nHouse rules.\n\n" +
  modes.map((m) => `${m.markers.start}\n\nbody of ${m.id}\n\n${m.markers.end}\n`).join("\n");

describe("activeAgentModes", () => {
  test("is empty without an AGENTS.md", async () => {
    await withRoot(async (root) => {
      assert.deepEqual(await activeAgentModes(root), []);
    });
  });

  test("lists the subagent mode once it is enabled", async () => {
    await withRoot(async (root) => {
      await enableAgentMode(root, SUBAGENT_MODE, bundles.subagent, "npm test");
      assert.deepEqual(ids(await activeAgentModes(root)), ["subagent"]);
    });
  });

  test("lists both modes when a hand-edited file holds both blocks", async () => {
    await withRoot(async (root) => {
      await fs.writeFile(agentsPath(root), bothBlocks());
      assert.deepEqual(ids(await activeAgentModes(root)), ["subagent", "parallel"]);
    });
  });

  test("throws on damaged markers", async () => {
    await withRoot(async (root) => {
      await fs.writeFile(agentsPath(root), `# Mine\n\n${PARALLEL_MODE.markers.start}\n\nhalf\n`);
      await assert.rejects(activeAgentModes(root), /damaged ai-rulebook:parallel-mode markers/);
    });
  });
});

describe("switchAgentMode to a mode", () => {
  test("replaces the other mode's block and keeps user text and the rule pack", async () => {
    await withRoot(async (root) => {
      await fs.writeFile(agentsPath(root), "# Mine\n\nHouse rules.\n");
      await enableAgentMode(root, SUBAGENT_MODE, bundles.subagent, "npm test");
      await installRulesIntoAgentsMd(root, ruleBundleDir, ["scope.mdc"], null);

      const result = await switchAgentMode(root, target(PARALLEL_MODE));

      assert.deepEqual(ids(result.removed), ["subagent"]);
      assert.equal(result.created, false);
      assert.equal(result.deletedFile, false);
      const text = await readAgentsMd(root);
      assert.ok(text.startsWith("# Mine\n\nHouse rules.\n"));
      assert.equal(count(text, PARALLEL_MODE.markers.start), 1);
      assert.equal(count(text, PARALLEL_MODE.markers.end), 1);
      assert.equal(count(text, SUBAGENT_MODE.markers.start), 0);
      assert.equal(count(text, SUBAGENT_MODE.markers.end), 0);
      assert.match(text, /^## Fast parallel agent mode$/m);
      assert.equal(await hasRulesBlock(root), true);
      assert.deepEqual(ids(await activeAgentModes(root)), ["parallel"]);
    });
  });

  test("works in the other direction", async () => {
    await withRoot(async (root) => {
      await enableAgentMode(root, PARALLEL_MODE, bundles.parallel, "npm test");

      const result = await switchAgentMode(root, target(SUBAGENT_MODE));

      assert.deepEqual(ids(result.removed), ["parallel"]);
      assert.deepEqual(ids(await activeAgentModes(root)), ["subagent"]);
    });
  });

  test("leaves one block when the file held both", async () => {
    await withRoot(async (root) => {
      await fs.writeFile(agentsPath(root), bothBlocks());

      const result = await switchAgentMode(root, target(PARALLEL_MODE));

      assert.deepEqual(ids(result.removed), ["subagent"]);
      const text = await readAgentsMd(root);
      assert.ok(text.startsWith("# Mine\n\nHouse rules.\n"));
      assert.equal(count(text, PARALLEL_MODE.markers.start), 1);
      assert.equal(count(text, SUBAGENT_MODE.markers.start), 0);
      assert.doesNotMatch(text, /body of/, "the parallel block is regenerated");
      assert.deepEqual(ids(await activeAgentModes(root)), ["parallel"]);
    });
  });

  test("reports created when AGENTS.md did not exist", async () => {
    await withRoot(async (root) => {
      const result = await switchAgentMode(root, target(PARALLEL_MODE));

      assert.deepEqual(result, { removed: [], created: true, deletedFile: false });
      assert.deepEqual(ids(await activeAgentModes(root)), ["parallel"]);
    });
  });

  test("refreshes in place when the target is already on", async () => {
    await withRoot(async (root) => {
      await enableAgentMode(root, PARALLEL_MODE, bundles.parallel, null);

      const result = await switchAgentMode(root, target(PARALLEL_MODE, undefined, "cargo test"));

      assert.deepEqual(result, { removed: [], created: false, deletedFile: false });
      const text = await readAgentsMd(root);
      assert.equal(count(text, PARALLEL_MODE.markers.start), 1);
      assert.equal(count(text, PARALLEL_MODE.markers.end), 1);
      assert.match(text, /`cargo test`/);
    });
  });
});

describe("switchAgentMode to null", () => {
  test("removes every mode block and deletes a file that held nothing else", async () => {
    await withRoot(async (root) => {
      await enableAgentMode(root, SUBAGENT_MODE, bundles.subagent, "npm test");

      const result = await switchAgentMode(root, null);

      assert.deepEqual(ids(result.removed), ["subagent"]);
      assert.equal(result.deletedFile, true);
      assert.equal(await exists(agentsPath(root)), false);
    });
  });

  test("keeps the file when user text remains", async () => {
    await withRoot(async (root) => {
      await fs.writeFile(agentsPath(root), bothBlocks());

      const result = await switchAgentMode(root, null);

      assert.deepEqual(ids(result.removed), ["subagent", "parallel"]);
      assert.equal(result.deletedFile, false);
      const text = await readAgentsMd(root);
      assert.ok(text.startsWith("# Mine\n\nHouse rules.\n"));
      assert.doesNotMatch(text, /ai-rulebook:/);
      assert.deepEqual(await activeAgentModes(root), []);
    });
  });

  test("does nothing, and creates no file, when no mode is on", async () => {
    await withRoot(async (root) => {
      assert.deepEqual(await switchAgentMode(root, null), {
        removed: [],
        created: false,
        deletedFile: false,
      });
      assert.equal(await exists(agentsPath(root)), false);

      await fs.writeFile(agentsPath(root), "# Mine\n");
      assert.deepEqual(await switchAgentMode(root, null), {
        removed: [],
        created: false,
        deletedFile: false,
      });
      assert.equal(await readAgentsMd(root), "# Mine\n");
    });
  });
});

describe("switchAgentMode failures leave AGENTS.md untouched", () => {
  for (const damagedMode of [SUBAGENT_MODE, PARALLEL_MODE]) {
    for (const [label, pick] of [
      ["to the subagent mode", () => target(SUBAGENT_MODE)],
      ["to the parallel mode", () => target(PARALLEL_MODE)],
      ["to off", () => null],
    ]) {
      test(`damaged ${damagedMode.id} markers reject a switch ${label}`, async () => {
        await withRoot(async (root) => {
          const damaged = `# Mine\n\n${damagedMode.markers.start}\n\nhalf a block\n`;
          await fs.writeFile(agentsPath(root), damaged);
          const before = await fs.readFile(agentsPath(root));

          await assert.rejects(switchAgentMode(root, pick()), /damaged ai-rulebook:/);

          assert.deepEqual(await fs.readFile(agentsPath(root)), before, "byte-identical");
        });
      });
    }
  }

  test("an unreadable bundle dir rejects before any write", async () => {
    await withRoot(async (root) => {
      await enableAgentMode(root, SUBAGENT_MODE, bundles.subagent, "npm test");
      const before = await fs.readFile(agentsPath(root));

      await assert.rejects(
        switchAgentMode(root, target(PARALLEL_MODE, path.join(root, "missing"))),
        (error) => {
          assert.match(error.message, /Failed to read bundled fast parallel agent mode file section\.md/);
          assert.equal(error.cause.code, "ENOENT");
          return true;
        }
      );

      assert.deepEqual(await fs.readFile(agentsPath(root)), before, "byte-identical");
    });
  });

  test("an unreadable bundle dir creates no file", async () => {
    await withRoot(async (root) => {
      await assert.rejects(switchAgentMode(root, target(SUBAGENT_MODE, path.join(root, "missing"))));
      assert.equal(await exists(agentsPath(root)), false);
    });
  });
});

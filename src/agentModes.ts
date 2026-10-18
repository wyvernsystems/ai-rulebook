import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  hasExtraBlock,
  removeExtraBlockFromAgentsMd,
  renderRuleForAgentsMd,
  replaceExtraBlocksInAgentsMd,
  writeExtraBlockInAgentsMd,
  type ExtraBlockMarkers,
} from "./agentsMd";
import { type TestCommand } from "./rulesOperations";
import { assertContainedPath } from "./safePaths";

/**
 * Agent modes: opt-in orchestration rules, each one block in `AGENTS.md`
 * outside the rule pack block and nothing else (no per-tool agent files or
 * settings). Each is off until its enable command runs.
 *
 * The modes pull in opposite directions (one saves tokens, the other spends
 * them for speed), so at most one may be on in a workspace: enabling a mode
 * fails while any other mode's block is present.
 */
export type AgentMode = {
  /** Stable id passed to the select command, e.g. "subagent". */
  id: string;
  /** Lower-case name used in messages, e.g. "token-efficient subagent mode". */
  name: string;
  /** Picker label, e.g. "Token-efficient subagent mode". */
  label: string;
  /** One-line picker description of what the mode trades. */
  summary: string;
  markers: ExtraBlockMarkers;
  /** Folder under `bundled/` holding the mode's `section.md`. */
  bundleFolder: string;
  /** Palette title of the disable command, quoted in conflict messages. */
  disableCommandTitle: string;
};

export const SUBAGENT_MODE: AgentMode = {
  id: "subagent",
  name: "token-efficient subagent mode",
  label: "Token-efficient subagent mode",
  summary: "Fewer expensive tokens: delegate to cheaper models",
  markers: {
    start: "<!-- ai-rulebook:subagent-mode:start -->",
    end: "<!-- ai-rulebook:subagent-mode:end -->",
    label: "ai-rulebook:subagent-mode",
  },
  bundleFolder: "subagent-mode",
  disableCommandTitle: "AI Rulebook: Disable token-efficient subagent mode",
};

export const PARALLEL_MODE: AgentMode = {
  id: "parallel",
  name: "fast parallel agent mode",
  label: "Fast parallel agent mode",
  summary: "Finish sooner: run independent units in parallel; uses more tokens",
  markers: {
    start: "<!-- ai-rulebook:parallel-mode:start -->",
    end: "<!-- ai-rulebook:parallel-mode:end -->",
    label: "ai-rulebook:parallel-mode",
  },
  bundleFolder: "parallel-mode",
  disableCommandTitle: "AI Rulebook: Disable fast parallel agent mode",
};

export const AGENT_MODES: readonly AgentMode[] = [SUBAGENT_MODE, PARALLEL_MODE];

/** Palette title of the command that switches modes in one step. */
export const SELECT_AGENT_MODE_COMMAND_TITLE = "AI Rulebook: Select agent mode…";

const SECTION_TEMPLATE = "section.md";

function otherModes(mode: AgentMode): AgentMode[] {
  return AGENT_MODES.filter((other) => other !== mode);
}

/** Message for enabling `mode` while `other` is on. */
export function agentModeConflictMessage(mode: AgentMode, other: AgentMode): string {
  return `${mode.name} can't be enabled while ${other.name} is on. Run "${SELECT_AGENT_MODE_COMMAND_TITLE}" to switch, or "${other.disableCommandTitle}" first.`;
}

/** Whether the mode's block is in `AGENTS.md`. Throws on damaged markers. */
export async function isAgentModeEnabled(workspaceRoot: string, mode: AgentMode): Promise<boolean> {
  return hasExtraBlock(workspaceRoot, mode.markers);
}

/**
 * Every mode whose block is in `AGENTS.md`. More than one means the file was
 * edited outside the extension and agents get conflicting instructions.
 * Throws on damaged markers.
 */
export async function activeAgentModes(workspaceRoot: string): Promise<AgentMode[]> {
  const active: AgentMode[] = [];
  for (const mode of AGENT_MODES) {
    if (await isAgentModeEnabled(workspaceRoot, mode)) {
      active.push(mode);
    }
  }
  return active;
}

/** The first other mode that is on in `workspaceRoot` and blocks enabling `mode`, or `null`. */
export async function conflictingAgentMode(
  workspaceRoot: string,
  mode: AgentMode
): Promise<AgentMode | null> {
  for (const other of otherModes(mode)) {
    if (await isAgentModeEnabled(workspaceRoot, other)) {
      return other;
    }
  }
  return null;
}

/**
 * Writes or refreshes the mode's block. The section is rendered before
 * anything is written; throws without writing while another mode is on.
 */
export async function enableAgentMode(
  workspaceRoot: string,
  mode: AgentMode,
  bundleDir: string,
  testCommand: TestCommand
): Promise<{ created: boolean }> {
  const body = await renderAgentModeBody(mode, bundleDir, testCommand);
  const conflicts = otherModes(mode).map((other) => ({
    markers: other.markers,
    message: agentModeConflictMessage(mode, other),
  }));
  return writeExtraBlockInAgentsMd(workspaceRoot, mode.markers, body, conflicts);
}

/**
 * Makes `target` the only mode on (or turns every mode off for `null`) in one
 * queued write: other modes' blocks are removed and the target's written
 * together, so the switch never leaves both or neither on halfway. The
 * section is rendered before anything is written.
 */
export async function switchAgentMode(
  workspaceRoot: string,
  target: { mode: AgentMode; bundleDir: string; testCommand: TestCommand } | null
): Promise<{ removed: AgentMode[]; created: boolean; deletedFile: boolean }> {
  const write = target
    ? {
        markers: target.mode.markers,
        body: await renderAgentModeBody(target.mode, target.bundleDir, target.testCommand),
      }
    : null;
  const toRemove = target ? otherModes(target.mode) : [...AGENT_MODES];
  const result = await replaceExtraBlocksInAgentsMd(
    workspaceRoot,
    toRemove.map((mode) => mode.markers),
    write
  );
  return {
    removed: toRemove.filter((mode) => result.removed.includes(mode.markers)),
    created: result.created,
    deletedFile: result.deletedFile,
  };
}

/** Reads and renders the mode's bundled section, with its managed-block note. */
async function renderAgentModeBody(
  mode: AgentMode,
  bundleDir: string,
  testCommand: TestCommand
): Promise<string> {
  const abs = path.join(bundleDir, SECTION_TEMPLATE);
  assertContainedPath(bundleDir, abs, `bundled ${mode.name}`);
  let template: string;
  try {
    template = await fs.readFile(abs, "utf8");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to read bundled ${mode.name} file ${SECTION_TEMPLATE}: ${reason}`, {
      cause: e,
    });
  }
  const section = renderRuleForAgentsMd(template, testCommand);
  const leftover = /\{\{[^}]*\}\}/.exec(section);
  if (leftover) {
    throw new Error(
      `Bundled ${mode.name} file ${SECTION_TEMPLATE} has an unknown placeholder ${leftover[0]}.`
    );
  }
  const note = `<!-- Managed by the AI Rulebook extension: ${mode.name}. Regenerated by the enable command; run the disable command to remove it. -->`;
  return `${note}\n\n${section}`;
}

/** Removes the mode's block; `AGENTS.md` is deleted under the rule pack's removal rules. */
export async function disableAgentMode(
  workspaceRoot: string,
  mode: AgentMode
): Promise<{ removed: boolean; deletedFile: boolean }> {
  return removeExtraBlockFromAgentsMd(workspaceRoot, mode.markers);
}

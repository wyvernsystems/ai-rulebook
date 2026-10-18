import { disableAgentMode, enableAgentMode, isAgentModeEnabled, SUBAGENT_MODE } from "./agentModes";
import { type ExtraBlockMarkers } from "./agentsMd";
import { type TestCommand } from "./rulesOperations";

/**
 * Token-efficient subagent mode: an opt-in set of orchestration rules that
 * keep the session model for judgment and push searching, editing, and check
 * runs onto subagents running cheaper models. Off until the enable command
 * runs, and cannot be enabled while fast parallel agent mode is on.
 *
 * The text names model tiers rather than vendor models and carries each
 * delegate's contract, so the orchestrating model applies it with whatever
 * its tool offers. Block handling is shared with the other modes in
 * `agentModes.ts`.
 */

export const SUBAGENT_MODE_MARKERS: ExtraBlockMarkers = SUBAGENT_MODE.markers;

/** Whether the mode's block is in `AGENTS.md`. Throws on damaged markers. */
export async function isSubagentModeEnabled(workspaceRoot: string): Promise<boolean> {
  return isAgentModeEnabled(workspaceRoot, SUBAGENT_MODE);
}

/** Writes or refreshes the mode's block. The section is rendered before anything is written. */
export async function enableSubagentMode(
  workspaceRoot: string,
  bundleDir: string,
  testCommand: TestCommand
): Promise<{ created: boolean }> {
  return enableAgentMode(workspaceRoot, SUBAGENT_MODE, bundleDir, testCommand);
}

/** Removes the mode's block; `AGENTS.md` is deleted under the rule pack's removal rules. */
export async function disableSubagentMode(
  workspaceRoot: string
): Promise<{ removed: boolean; deletedFile: boolean }> {
  return disableAgentMode(workspaceRoot, SUBAGENT_MODE);
}

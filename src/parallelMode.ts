import { disableAgentMode, enableAgentMode, isAgentModeEnabled, PARALLEL_MODE } from "./agentModes";
import { type ExtraBlockMarkers } from "./agentsMd";
import { type TestCommand } from "./rulesOperations";

/**
 * Fast parallel agent mode: an opt-in set of orchestration rules that split a
 * task into independent units, run them on parallel subagents, then integrate,
 * verify, and fix the combined result. It spends more tokens to finish sooner.
 * Off until the enable command runs, and cannot be enabled while
 * token-efficient subagent mode is on.
 *
 * Block handling is shared with the other modes in `agentModes.ts`.
 */

export const PARALLEL_MODE_MARKERS: ExtraBlockMarkers = PARALLEL_MODE.markers;

/** Whether the mode's block is in `AGENTS.md`. Throws on damaged markers. */
export async function isParallelModeEnabled(workspaceRoot: string): Promise<boolean> {
  return isAgentModeEnabled(workspaceRoot, PARALLEL_MODE);
}

/** Writes or refreshes the mode's block. The section is rendered before anything is written. */
export async function enableParallelMode(
  workspaceRoot: string,
  bundleDir: string,
  testCommand: TestCommand
): Promise<{ created: boolean }> {
  return enableAgentMode(workspaceRoot, PARALLEL_MODE, bundleDir, testCommand);
}

/** Removes the mode's block; `AGENTS.md` is deleted under the rule pack's removal rules. */
export async function disableParallelMode(
  workspaceRoot: string
): Promise<{ removed: boolean; deletedFile: boolean }> {
  return disableAgentMode(workspaceRoot, PARALLEL_MODE);
}

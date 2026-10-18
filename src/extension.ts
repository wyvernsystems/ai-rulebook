import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  AGENTS_MD,
  agentsMdPath,
  hasRulesBlock,
  installRulesIntoAgentsMd,
  parseAgentsMd,
  removeRulesBlockFromAgentsMd,
  ruleId,
  ruleSectionLine,
  setAllRulesEnabledInAgentsMd,
  setRuleEnabledInAgentsMd,
} from "./agentsMd";
import { CLAUDE_MD, ensureAgentsMdImport, removeAgentsMdImport } from "./claudeMd";
import { isClineInstalled } from "./cline";
import { isCursorHost } from "./cursor";
import { readBundleManifest, type BundleManifest } from "./manifest";
import { createAiRulesOutputChannel, showRulePackStatusInOutput } from "./ruleStatusUi";
import {
  pathExists,
  removeLegacyRuleFolders,
  workspaceShowsAgentEvidence,
  type LegacyFolderRemovalResult,
  type TestCommand,
} from "./rulesOperations";
import { isSafeManifestEntry } from "./safePaths";
import {
  activeAgentModes,
  AGENT_MODES,
  agentModeConflictMessage,
  conflictingAgentMode,
  disableAgentMode,
  enableAgentMode,
  PARALLEL_MODE,
  SELECT_AGENT_MODE_COMMAND_TITLE,
  SUBAGENT_MODE,
  switchAgentMode,
  type AgentMode,
} from "./agentModes";
import { detectTestCommand } from "./testCommand";
import {
  bindRulesTreeView,
  RuleStatusDecorationProvider,
  RulesTreeProvider,
  RULES_TREE_VIEW_ID,
} from "./sidebarTreeView";

const LAST_SEEN_VERSION_KEY = "aiRules.lastSeenExtensionVersion";
const AUTO_INSTALL_SKIPPED_NOTICE_KEY = "aiRules.autoInstallSkippedNoticeShown";
const INSTALL_COMMAND_TITLE = "AI Rulebook: Install / update rule pack";
const NOT_INSTALLED_HINT = `no rule pack in ${AGENTS_MD} yet — run "${INSTALL_COMMAND_TITLE}" first.`;
/** Debounce for refreshing the UI after `AGENTS.md` changes on disk. */
const AGENTS_MD_REFRESH_DELAY_MS = 200;

function getAiRulesBoolean(key: string, defaultValue: boolean): boolean {
  const v = vscode.workspace.getConfiguration("aiRules").get(key);
  if (typeof v === "boolean") {
    return v;
  }
  return defaultValue;
}

/** Every open workspace folder's fsPath, in order (multi-root aware). */
function workspaceRoots(): string[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .map((folder) => folder.uri.fsPath)
    .filter((fsPath): fsPath is string => typeof fsPath === "string" && fsPath.length > 0);
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function folderLabel(root: string): string {
  return path.basename(root) || root;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const extensionRoot = context.extensionPath;
  const bundleDir = path.join(extensionRoot, "bundled", "ai-rules");
  let manifest: BundleManifest;
  try {
    manifest = readBundleManifest(extensionRoot);
  } catch (e) {
    vscode.window.showErrorMessage(
      `AI Rulebook: failed to load rule pack — ${errorMessage(e)}. Reinstall the extension or rebuild the bundle.`
    );
    return;
  }

  if (manifest.files.length === 0 || manifest.files.some((file) => !file.endsWith(".mdc"))) {
    vscode.window.showErrorMessage(
      "AI Rulebook: bundled manifest must contain at least one .mdc rule and no other files. Reinstall the extension or rebuild the bundle."
    );
    return;
  }
  const mdcs = manifest.files;
  const rulesOutput = createAiRulesOutputChannel();
  context.subscriptions.push(rulesOutput);

  const sidebarColors = new RuleStatusDecorationProvider();
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(sidebarColors));

  const treeProvider = new RulesTreeProvider(mdcs);
  treeProvider.onAfterRefresh(() => sidebarColors.refresh());

  /**
   * Status bar element: shows the enabled-rule count in the first workspace
   * folder's AGENTS.md and clicks through to the status command.
   */
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.name = "AI Rulebook";
  statusBarItem.command = "aiRules.showCoreStatus";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  /** Enabled-rule count in `root`, or `null` when the pack is not installed. Throws on a damaged block. */
  const countEnabledRules = async (root: string): Promise<number | null> => {
    let text: string;
    try {
      text = await fs.readFile(agentsMdPath(root), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new Error(`Failed to read ${AGENTS_MD}: ${errorMessage(e)}`, { cause: e });
    }
    const parsed = parseAgentsMd(text);
    if (!parsed) {
      return null;
    }
    const enabledIds = new Set(parsed.rules.filter((rule) => rule.enabled).map((rule) => rule.id));
    return mdcs.filter((ruleFile) => enabledIds.has(ruleId(ruleFile))).length;
  };

  const updateStatusBar = async (): Promise<void> => {
    const root = workspaceRoots()[0];
    if (!root) {
      statusBarItem.text = "$(checklist) AI Rulebook";
      statusBarItem.tooltip = "AI Rulebook: open a folder to install the rule pack.";
      return;
    }
    let enabledCount: number | null;
    let modes: AgentMode[];
    try {
      enabledCount = await countEnabledRules(root);
      modes = await activeAgentModes(root);
    } catch (e) {
      statusBarItem.text = "$(warning) AI Rulebook";
      statusBarItem.tooltip = `AI Rulebook: ${errorMessage(e)}`;
      return;
    }
    const rules = `AI ${enabledCount ?? 0}/${mdcs.length}`;
    statusBarItem.text =
      modes.length > 1
        ? `$(warning) ${rules} · ${modes.length} modes`
        : `$(checklist) ${rules}${modes.length === 1 ? ` · ${modes[0].id}` : ""}`;
    const ruleSummary =
      enabledCount === null
        ? `rule pack not installed in ${AGENTS_MD}.`
        : `${enabledCount} of ${mdcs.length} rules enabled in ${AGENTS_MD}.`;
    const modeSummary =
      modes.length > 1
        ? `${modes.map((mode) => mode.name).join(" and ")} are both on, so agents get conflicting instructions. Run "${SELECT_AGENT_MODE_COMMAND_TITLE}" to keep one.`
        : `Agent mode: ${modes.length === 1 ? modes[0].name : "off"}.`;
    statusBarItem.tooltip = `AI Rulebook: ${ruleSummary} ${modeSummary} Click for status.`;
  };

  const refreshUi = async (): Promise<void> => {
    treeProvider.refresh();
    await updateStatusBar();
  };

  const requireRoots = (): string[] => {
    const roots = workspaceRoots();
    if (roots.length === 0) {
      throw new Error("Open a folder in VS Code first.");
    }
    return roots;
  };

  const requireFirstRoot = (): string => requireRoots()[0];

  const requireInstalled = async (root: string): Promise<void> => {
    if (!(await hasRulesBlock(root))) {
      throw new Error(NOT_INSTALLED_HINT);
    }
  };

  /** Installs or refreshes the pack in one folder, keeping recorded rule state. */
  const installInto = async (root: string): Promise<void> => {
    const testCommand: TestCommand = await detectTestCommand(root);
    await installRulesIntoAgentsMd(root, bundleDir, mdcs, testCommand);
    await ensureAgentsMdImport(root);
  };

  const toggleRule = async (root: string, ruleFile: string, enabled: boolean): Promise<void> => {
    await setRuleEnabledInAgentsMd(root, bundleDir, ruleFile, enabled, await detectTestCommand(root));
  };

  bindRulesTreeView(context, treeProvider, toggleRule, updateStatusBar);

  const register = (id: string, handler: (...args: unknown[]) => Promise<void>): void => {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        try {
          await handler(...args);
        } catch (e) {
          vscode.window.showErrorMessage(`AI Rulebook: ${errorMessage(e)}`);
        }
      })
    );
  };

  register("aiRules.installWorkspace", async () => {
    const roots = requireRoots();
    for (const root of roots) {
      await installInto(root);
    }
    const where =
      roots.length === 1
        ? `${AGENTS_MD} (${CLAUDE_MD} imports it)`
        : `${AGENTS_MD} in ${roots.length} folders (${CLAUDE_MD} imports it)`;
    vscode.window.showInformationMessage(`AI Rulebook: rule pack installed into ${where}.`);
    await showRulePackStatusInOutput(rulesOutput, roots[0], mdcs);
    await refreshUi();
  });

  const setAll = async (enabled: boolean): Promise<void> => {
    const root = requireFirstRoot();
    await requireInstalled(root);
    await setAllRulesEnabledInAgentsMd(root, bundleDir, mdcs, enabled, await detectTestCommand(root));
    vscode.window.showInformationMessage(
      `AI Rulebook: all rules ${enabled ? "enabled" : "disabled"} in ${AGENTS_MD}.`
    );
    await refreshUi();
  };
  register("aiRules.enableCoreWorkspace", () => setAll(true));
  register("aiRules.disableCoreWorkspace", () => setAll(false));

  const setOne = async (enabled: boolean): Promise<void> => {
    const root = requireFirstRoot();
    await requireInstalled(root);
    const pick = await vscode.window.showQuickPick([...mdcs], {
      placeHolder: `Rule to ${enabled ? "enable" : "disable"} in ${AGENTS_MD}`,
    });
    if (!pick) {
      return;
    }
    await toggleRule(root, pick, enabled);
    vscode.window.showInformationMessage(`AI Rulebook: ${pick} ${enabled ? "enabled" : "disabled"}.`);
    await refreshUi();
  };
  register("aiRules.enableRuleWorkspace", () => setOne(true));
  register("aiRules.disableRuleWorkspace", () => setOne(false));

  register("aiRules.removeWorkspace", async () => {
    const roots = requireRoots();
    const action = "Remove rule pack";
    const choice = await vscode.window.showWarningMessage(
      roots.length === 1
        ? `Remove the AI Rulebook block from ${AGENTS_MD}? ${AGENTS_MD} and ${CLAUDE_MD} are deleted only when the extension created them.`
        : `Remove the AI Rulebook block from ${AGENTS_MD} in all ${roots.length} folders? ${AGENTS_MD} and ${CLAUDE_MD} are deleted only when the extension created them.`,
      { modal: true },
      action
    );
    if (choice !== action) {
      return;
    }
    let removedCount = 0;
    for (const root of roots) {
      const result = await removeRulesBlockFromAgentsMd(root);
      if (result.removed) {
        removedCount += 1;
      }
      if (result.deletedFile) {
        await removeAgentsMdImport(root);
      }
    }
    vscode.window.showInformationMessage(
      removedCount === 0
        ? `AI Rulebook: nothing removed — no rule pack found in ${AGENTS_MD}.`
        : roots.length === 1
          ? `AI Rulebook: rule pack removed from ${AGENTS_MD}.`
          : `AI Rulebook: rule pack removed from ${AGENTS_MD} in ${removedCount} of ${roots.length} folders.`
    );
    await refreshUi();
  });

  register("aiRules.removeLegacyFoldersWorkspace", async () => {
    const roots = requireRoots();
    const action = "Remove legacy folders";
    const choice = await vscode.window.showWarningMessage(
      "Delete the per-tool rule folders earlier AI Rulebook releases generated (.cursor/rules/ai-rules, .clinerules/ai-rules, .opencode/rules/ai-rules and its command file, .claude/rules/ai-rules, .windsurf/rules/ai-rules, .github/instructions/ai-rules)? " +
        `${AGENTS_MD} is not touched.`,
      { modal: true },
      action
    );
    if (choice !== action) {
      return;
    }
    const combined: LegacyFolderRemovalResult = {
      cursor: false,
      cline: false,
      opencode: false,
      claude: false,
      windsurf: false,
      copilot: false,
    };
    for (const root of roots) {
      const result = await removeLegacyRuleFolders(root);
      for (const key of Object.keys(combined) as Array<keyof LegacyFolderRemovalResult>) {
        combined[key] = combined[key] || result[key];
      }
    }
    const describe = (label: string, removed: boolean) =>
      `${label}: ${removed ? "removed" : "not found"}`;
    vscode.window.showInformationMessage(
      "AI Rulebook: legacy folders — " +
        [
          describe("Cursor", combined.cursor),
          describe("Cline", combined.cline),
          describe("opencode", combined.opencode),
          describe("Claude Code", combined.claude),
          describe("Windsurf", combined.windsurf),
          describe("GitHub Copilot", combined.copilot),
        ].join(", ") +
        "."
    );
  });

  const agentModeBundleDir = (mode: AgentMode): string =>
    path.join(extensionRoot, "bundled", mode.bundleFolder);

  const registerAgentModeCommands = (mode: AgentMode, enableId: string, disableId: string): void => {
    const modeBundleDir = agentModeBundleDir(mode);

    register(enableId, async () => {
      const roots = requireRoots();
      // Check every folder first so a conflict in one writes nothing anywhere.
      for (const root of roots) {
        const other = await conflictingAgentMode(root, mode);
        if (other) {
          const where = roots.length === 1 ? "" : ` (in ${folderLabel(root)})`;
          throw new Error(`${agentModeConflictMessage(mode, other)}${where}`);
        }
      }
      for (const root of roots) {
        await enableAgentMode(root, mode, modeBundleDir, await detectTestCommand(root));
        await ensureAgentsMdImport(root);
      }
      const where = roots.length === 1 ? AGENTS_MD : `${AGENTS_MD} in ${roots.length} folders`;
      vscode.window.showInformationMessage(`AI Rulebook: ${mode.name} enabled in ${where}.`);
      await refreshUi();
    });

    register(disableId, async () => {
      const roots = requireRoots();
      let removedCount = 0;
      for (const root of roots) {
        const result = await disableAgentMode(root, mode);
        if (result.removed) {
          removedCount += 1;
        }
        if (result.deletedFile) {
          await removeAgentsMdImport(root);
        }
      }
      vscode.window.showInformationMessage(
        removedCount === 0
          ? `AI Rulebook: nothing removed — ${mode.name} is not enabled in ${AGENTS_MD}.`
          : roots.length === 1
            ? `AI Rulebook: ${mode.name} removed from ${AGENTS_MD}.`
            : `AI Rulebook: ${mode.name} removed from ${AGENTS_MD} in ${removedCount} of ${roots.length} folders.`
      );
      await refreshUi();
    });
  };

  registerAgentModeCommands(SUBAGENT_MODE, "aiRules.enableSubagentMode", "aiRules.disableSubagentMode");
  registerAgentModeCommands(PARALLEL_MODE, "aiRules.enableParallelMode", "aiRules.disableParallelMode");

  /**
   * Switches every open folder to one agent mode, or turns modes off. Takes an
   * optional mode id ("off", "subagent", "parallel"); without one it asks
   * with a quick pick that marks the first folder's current mode.
   */
  register("aiRules.selectAgentMode", async (requested?: unknown) => {
    const roots = requireRoots();
    // Read every folder first so damaged markers anywhere stop the switch before any write.
    const current: AgentMode[][] = [];
    for (const root of roots) {
      current.push(await activeAgentModes(root));
    }
    let targetId: string;
    if (typeof requested === "string") {
      targetId = requested;
    } else {
      const first = current[0];
      const items: Array<vscode.QuickPickItem & { id: string }> = [
        {
          id: "off",
          label: "Off",
          description: first.length === 0 ? "current" : undefined,
          detail: `No agent mode block in ${AGENTS_MD}`,
        },
        ...AGENT_MODES.map((mode) => ({
          id: mode.id,
          label: mode.label,
          description: first.includes(mode)
            ? first.length > 1
              ? "current (conflicting)"
              : "current"
            : undefined,
          detail: mode.summary,
        })),
      ];
      const pick = await vscode.window.showQuickPick(items, {
        title: "AI Rulebook: agent mode",
        placeHolder: `Choose the agent mode written into ${AGENTS_MD}`,
      });
      if (!pick) {
        return;
      }
      targetId = pick.id;
    }
    const target = targetId === "off" ? null : AGENT_MODES.find((mode) => mode.id === targetId);
    if (target === undefined) {
      throw new Error(`Unknown agent mode "${targetId}".`);
    }
    for (const root of roots) {
      const result = await switchAgentMode(
        root,
        target
          ? { mode: target, bundleDir: agentModeBundleDir(target), testCommand: await detectTestCommand(root) }
          : null
      );
      if (target) {
        await ensureAgentsMdImport(root);
      } else if (result.deletedFile) {
        await removeAgentsMdImport(root);
      }
    }
    const where = roots.length === 1 ? AGENTS_MD : `${AGENTS_MD} in ${roots.length} folders`;
    const wasOn = current.some((modes) => modes.length > 0);
    vscode.window.showInformationMessage(
      target
        ? `AI Rulebook: agent mode set to ${target.name} in ${where}.`
        : wasOn
          ? `AI Rulebook: agent modes turned off in ${where}.`
          : `AI Rulebook: no agent mode was on in ${where}.`
    );
    await refreshUi();
  });

  register("aiRules.showCoreStatus", async () => {
    const root = requireFirstRoot();
    await vscode.commands.executeCommand(`${RULES_TREE_VIEW_ID}.focus`);
    await showRulePackStatusInOutput(rulesOutput, root, mdcs);
    await refreshUi();
  });

  register("aiRules.refreshTree", async () => {
    await refreshUi();
  });

  register("aiRules.revealRuleFile", async (ruleFile: unknown) => {
    if (!isSafeManifestEntry(ruleFile) || !mdcs.includes(ruleFile)) {
      return;
    }
    const root = requireFirstRoot();
    const file = agentsMdPath(root);
    let text: string | null = null;
    if (await pathExists(file)) {
      text = await fs.readFile(file, "utf8");
    }
    const line = text === null ? null : ruleSectionLine(text, ruleFile);
    if (line === null) {
      vscode.window.showWarningMessage(`AI Rulebook: ${NOT_INSTALLED_HINT}`);
      return;
    }
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document, {
      preview: true,
      selection: new vscode.Range(line, 0, line, 0),
    });
  });

  /**
   * Installs into every open folder that shows evidence of AI-agent use
   * (or when the host itself is an agent IDE). Folders that already carry
   * the block are left alone, including their disabled rules; a damaged
   * block is reported instead of overwritten.
   */
  const autoInstallIfMissing = async (): Promise<void> => {
    const roots = workspaceRoots();
    if (roots.length === 0 || !getAiRulesBoolean("autoInstallOnOpenWorkspace", true)) {
      return;
    }
    const hostEvidence = isCursorHost() || isClineInstalled();
    const installed: string[] = [];
    let skippedForEvidence = 0;
    for (const root of roots) {
      try {
        if ((await countEnabledRules(root)) !== null) {
          continue;
        }
      } catch (e) {
        vscode.window.showErrorMessage(
          `AI Rulebook: ${errorMessage(e)} Fix the markers in ${folderLabel(root)}/${AGENTS_MD} or remove the block, then run "${INSTALL_COMMAND_TITLE}".`
        );
        continue;
      }
      if (!hostEvidence && !(await workspaceShowsAgentEvidence(root))) {
        skippedForEvidence += 1;
        continue;
      }
      try {
        await installInto(root);
        installed.push(root);
      } catch (e) {
        vscode.window.showErrorMessage(
          `AI Rulebook: auto-install into ${folderLabel(root)}/${AGENTS_MD} failed — ${errorMessage(e)}`
        );
      }
    }
    if (installed.length > 0) {
      vscode.window.showInformationMessage(
        installed.length === 1
          ? `AI Rulebook: rule pack installed into ${AGENTS_MD} (${CLAUDE_MD} imports it). Toggle rules from the AI Rulebook sidebar.`
          : `AI Rulebook: rule pack installed into ${AGENTS_MD} in ${installed.length} folders (${CLAUDE_MD} imports it). Toggle rules from the AI Rulebook sidebar.`
      );
      await showRulePackStatusInOutput(rulesOutput, roots[0], mdcs);
    }
    if (
      skippedForEvidence > 0 &&
      installed.length === 0 &&
      !context.globalState.get<boolean>(AUTO_INSTALL_SKIPPED_NOTICE_KEY)
    ) {
      await context.globalState.update(AUTO_INSTALL_SKIPPED_NOTICE_KEY, true);
      vscode.window.showInformationMessage(
        `AI Rulebook: this workspace has no AI-agent files yet, so the rule pack was not installed. Run "${INSTALL_COMMAND_TITLE}" to add ${AGENTS_MD} whenever you want it.`
      );
    }
  };

  /**
   * Refreshes the sidebar and status bar when `AGENTS.md` changes outside the
   * extension (a pull, a branch switch, a hand edit). Events are debounced;
   * the extension's own writes trigger a harmless extra refresh.
   */
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = (): void => {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void refreshUi();
    }, AGENTS_MD_REFRESH_DELAY_MS);
  };
  let agentsMdWatchers: vscode.FileSystemWatcher[] = [];
  const watchAgentsMd = (): void => {
    for (const watcher of agentsMdWatchers) {
      watcher.dispose();
    }
    agentsMdWatchers = (vscode.workspace.workspaceFolders ?? []).map((folder) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, AGENTS_MD)
      );
      watcher.onDidCreate(scheduleRefresh);
      watcher.onDidChange(scheduleRefresh);
      watcher.onDidDelete(scheduleRefresh);
      return watcher;
    });
  };
  watchAgentsMd();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      watchAgentsMd();
      scheduleRefresh();
    }),
    {
      dispose: () => {
        if (refreshTimer !== undefined) {
          clearTimeout(refreshTimer);
        }
        for (const watcher of agentsMdWatchers) {
          watcher.dispose();
        }
      },
    }
  );

  await autoInstallIfMissing();
  await updateStatusBar();

  const current = context.extension.packageJSON.version as string;
  const prev = context.globalState.get<string>(LAST_SEEN_VERSION_KEY);
  if (
    getAiRulesBoolean("promptInstallOnUpdate", true) &&
    prev &&
    prev !== current &&
    vscode.workspace.workspaceFolders?.length
  ) {
    const pick = await vscode.window.showInformationMessage(
      `AI Rulebook extension updated to v${current}. Refresh workspace rules from the bundle?`,
      "Install / update in workspace",
      "Not now"
    );
    if (pick === "Install / update in workspace") {
      await vscode.commands.executeCommand("aiRules.installWorkspace");
    }
  }
  await context.globalState.update(LAST_SEEN_VERSION_KEY, current);
}

export function deactivate(): void {}

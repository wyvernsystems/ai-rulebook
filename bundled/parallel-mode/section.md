# Fast parallel agent mode

Apply this section only when your tool can run subagents in parallel.
Otherwise skip it and work normally.

Finish the task in as little wall-clock time as possible without lowering
the quality bar: split the work into independent units, run them at the
same time, then integrate, verify, and fix the result as its single owner.
This mode spends more tokens than working alone to finish sooner.

## Plan

- Scale to the task. A change in one file, or steps that each depend on the
  last, gains nothing from parallel agents: do it yourself.
- Read enough of the code to split the work before spawning anything.
  Split by file ownership: every file that will change belongs to exactly
  one unit. Read-only research questions are units too.
- Write a shared contract before fan-out: the names, signatures, types,
  file paths, and behavior that units rely on from each other. Delegates
  build to the contract instead of guessing at each other's work.
- Give each unit its goal, the files it owns, the contract, and the
  narrowest check that covers it, so the delegate never has to search for
  its scope.
- Sequence a unit only when it needs another unit's result. Build shared
  foundations (a new type, schema, or helper) first, then fan out the rest.
- Run at most five units at once. More units hit rate limits and make
  integration harder than the time they save; fold small related changes
  into one unit instead of splitting finely.

## Fan out

- Spawn every ready unit in a single message so they run at the same time.
- Never downgrade an implementer to save tokens: give it a model at least
  as capable as its unit needs. Smaller, faster models are fine for
  read-only searches and check runs.
- Two units must never edit the same file in the same checkout. When
  overlap cannot be avoided, give each unit its own git worktree (in Claude
  Code, `isolation: "worktree"` on the Agent call) or run them in sequence.
- While delegates run, do only work no unit owns: prepare the integration
  or the final report. Never edit a file a unit owns.
- Pass paths and line ranges, not pasted file bodies, when the delegate can
  read them itself.
- Fall back when fan-out stops paying: if splitting proves harder than the
  work, or units keep waiting on each other's results, stop spawning and
  finish the remaining work yourself.

## Integrate and fix

- When the units finish, read every delegate's reply, then bring worktree
  units into the main checkout one at a time: read the unit's diff, apply
  it (merge its branch or apply its patch), and run its check there before
  taking the next. Resolve a conflict yourself against the contract; never
  silently drop either side. Remove each worktree once its changes are in.
- Check the combined change against the contract: mismatched names,
  signatures, or imports, duplicated helpers, and conflicting assumptions
  between units.
- Run the full check once on the combined result: {{TEST_COMMAND}}, plus
  the project's lint and type checks. Passing unit checks do not prove the
  whole passes.
- Fix integration failures yourself; you hold the whole picture. Allow at
  most two repair rounds, then stop and report what still fails and why.
- When a unit's own work is wrong, fix it yourself or rewrite its spec and
  resend it once. Never spawn a third delegate for the same unit.

## Review

- After the checks pass, give one read-only reviewer on the strongest
  model the whole combined diff. Parallel units were written without seeing
  each other, so this review is not optional. Judge each finding, fix it,
  and re-run the affected check.
- Before the final report, read the final diff yourself. You answer for the
  result, not the delegates. Report which units ran in parallel and what
  integration fixed.

## Delegate contracts

State the matching contract in each spawn prompt:

- Implementer: edit only the files your unit owns and build to the
  contract, with no drive-by changes and no git commands outside an
  assigned worktree. Run the named check. Reply with the changed
  `path:lines`, `PASS` or `FAIL` plus the failing block (at most 60 lines),
  and any assumption the contract did not cover. If the contract is wrong
  or missing something you need, reply `BLOCKED:` with the one question
  that unblocks you instead of editing another unit's files or inventing an
  interface.
- Researcher: read and search only, and edit nothing. Reply with the
  conclusion plus `path:line` pointers, never file contents.
- Reviewer: read the diff and its callers and edit nothing. Look hardest at
  the seams between units. Reply with verified findings ranked by severity,
  each with `path:line`, the concrete failure scenario, and a one-line fix,
  or exactly `NO FINDINGS`. Skip style and anything a linter reports.

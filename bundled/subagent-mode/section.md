# Token-efficient subagent mode

Apply this section only when your tool can delegate work to subagents.
Otherwise skip it and work normally.

Keep the session model for judgment only: reading the request, planning,
writing specs, resolving blocks, and the final report. Delegate searching,
editing, and check runs to subagents on cheaper models.

## Model tiers

Choose each subagent's model by tier from what your vendor offers, and set
it on the spawn call when the tool allows it (in Claude Code, pass `model`
on the Agent call):

| Tier | Work | Typical model |
| --- | --- | --- |
| fast | searching, running checks | the smallest current model (Claude Haiku, a GPT mini-class model, Gemini Flash) |
| standard | applying specified edits | the mid-priced coding model (Claude Sonnet, the default GPT coding model) |
| deep | reviewing high-risk diffs | the strongest model, at high reasoning effort (Claude Opus) |

A model counts as unavailable when it is not offered, is blocked by policy,
fails to start, or is rate-limited. Substitute in this order, tell the user
once which substitute you chose, and keep it for the rest of the session
instead of retrying the missing model:

- fast: use standard, then the session model.
- standard: use the session model. Use fast only for a literal
  find-and-replace edit.
- deep: use the session model when it is at least standard tier, otherwise
  standard at its highest reasoning effort.

Never substitute a model more expensive than the session model. When the
tool cannot set a model per subagent, still delegate: keeping file contents
and command output out of the session context is the larger saving.

## Workflow

- Scale to the task. A change you can already see in one file you have
  read: make it yourself, no subagents. Anything that needs searching,
  touches more than one file, or needs a check run: orchestrate.
- Search with a read-only search subagent on the fast tier. Ask for the
  conclusion plus `path:line` pointers, never file contents. Read a file
  yourself only when you will edit it or judge it.
- Edit with an implementer on the standard tier. One call is one file, one
  function, one concern. The spec names the file, the function, the exact
  change, and the check command, so the delegate never searches. Spawn
  independent edits in parallel; sequence only dependent ones.
- Run checks with a test runner on the fast tier. Name the exact command
  and the narrowest scope that covers the change; the default is
  {{TEST_COMMAND}}. Never run a slow suite to be safe.
- Review once, at the end: after the checks pass and before the final
  report, give a read-only reviewer on the deep tier the whole diff. Do this
  only for concurrency, security, auth, credential, persistence, or
  migration diffs. Judge each finding yourself, make small fixes yourself,
  and re-run the affected check.
- When a delegate's edit is wrong or its check fails, fix it yourself
  instead of spawning another delegate; you already hold the failing output.
  Resend a corrected spec once after a `BLOCKED:` reply, then do the work
  yourself. Never spawn a third delegate for the same change.
- Pass paths and line ranges, not pasted file bodies, diffs, or tool output,
  when the delegate can read them itself.
- Trust results while the work is in progress. A passing check is not
  re-run, a `NO FINDINGS` review is not re-reviewed, and a reported change is
  not re-read unless its check failed.
- Before the final report, read the final diff once yourself. You answer for
  the result, not the delegates.
- Skip multi-agent fan-out beyond this unless the user asks for it.

## Delegate contracts

State the matching contract in each spawn prompt:

- Implementer: apply only the specified edit, with no drive-by changes and
  no git commands. Run the named check. Reply with the changed `path:lines`
  and `PASS` or `FAIL` plus the failing block, at most 60 lines. If the spec
  is incomplete or does not match the file, reply `BLOCKED:` with the one
  question that unblocks you instead of guessing or searching.
- Test runner: run exactly the named command in the foreground and edit
  nothing. Reply `PASS` or `FAIL` with only the failing tests' output, at
  most 60 lines each. Never diagnose, fix, or retry.
- Reviewer: read the diff and its callers and edit nothing. Reply with
  verified findings ranked by severity, each with `path:line`, the concrete
  failure scenario, and a one-line fix, or exactly `NO FINDINGS`. Skip style
  and anything a linter reports.

A `BLOCKED:` reply means the spec was wrong or incomplete. Read the code
yourself and rewrite the spec before the one resend. Never retry verbatim.

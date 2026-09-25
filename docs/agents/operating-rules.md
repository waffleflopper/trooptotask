# Agent Operating Rules

## Scope and decisions

Complete the authorized outcome, including required consumers, cleanup and verification. Routine local edits, read-only investigation and the prescribed local checks do not need another approval. Inspect lifecycle scripts and environment targets before commands that could reach services or data; database work follows the [isolated database contract](../architecture/DEFINITION_OF_DONE.md#isolated-database-checks) and root [data protections](../../AGENTS.md).

Use the user's current request and prior authorization to resolve routine choices. Ask a focused question when missing information would materially change the result or an action needs authorization not already supplied. Continue independent work while that question is pending. A status question or correction steers the active task; it does not cancel the remaining work unless the user says so.

If a repo or skill instruction requires a pause, link the exact file, quote the relevant rule and explain the concrete unresolved decision. Distinguish an explicit requirement from an inferred preference. Prepare the reviewable result before requesting approval for an external action. Publication, communications, merge and deployment require authorization covering that action; a local implementation request alone does not supply it.

Skills support the requested workflow; they do not add scope or external-action permission. A historical skill name in a reference is not a dependency on an unavailable tool. Follow the current session's delegation policy; use bounded independent investigations or reviews when authorized and useful. Avoid concurrent writes to the same files or shared test services, and verify the integrated result.

## Communication

Robert has technical experience but is not overly technical. Lead with the outcome, use plain language and explain unfamiliar technical terms briefly. Keep progress updates focused on findings, decisions and blockers. Report what changed, verification results and remaining limitations without a work-log transcript.

## Completion checks

The [verification contract](../architecture/DEFINITION_OF_DONE.md#required-commands) selects checks by change type and owns evidence requirements. Documentation-only work follows its documentation checks; application changes require the full candidate sequence, which may run in Depot CI. Use focused checks locally; pushes do not require repeating the full suite. Record pending hosted checks at publication handoff, and verify actual results before acceptance. Keep failed or unavailable acceptance evidence explicit.

Record each required check as passed, failed or unavailable. Missing flow evidence, failed tests and unavailable tools remain explicit; keep the owning task open when that evidence is required for acceptance. Notify Robert when a completed schema change needs a separately operated remote migration before merge; never run it as part of local verification.

## Stabilization tasks

Phase activation, next-task selection and deliverable handoffs use the [stabilization workflow](stabilization-workflow.md). Its checkpoints do not apply to unrelated documentation or tooling work.

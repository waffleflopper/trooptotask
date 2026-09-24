# Agent Operating Rules

## Scope and decisions

Complete the authorized outcome, including required consumers, cleanup and verification. Routine local edits, read-only investigation and the prescribed local checks do not need another approval. Inspect lifecycle scripts and environment targets before commands that could reach services or data; database work follows the [isolated database contract](../architecture/DEFINITION_OF_DONE.md#isolated-database-checks) and root [data protections](../../AGENTS.md).

Use the user's current request and prior authorization to resolve routine choices. Ask a focused question when missing information would materially change the result or an action needs authorization not already supplied. Continue independent work while that question is pending. A status question or correction steers the active task; it does not cancel the remaining work unless the user says so.

If a repo or skill instruction requires a pause, link the exact file, quote the relevant rule and explain the concrete unresolved decision. Distinguish an explicit requirement from an inferred preference. Prepare the reviewable result before requesting approval for an external action. Publication, communications, merge and deployment require authorization covering that action; a local implementation request alone does not supply it.

Skills support the requested workflow; they do not add scope or external-action permission. A historical skill name in a reference is not a dependency on an unavailable tool. Follow the current session's delegation policy; use bounded independent investigations or reviews when authorized and useful. Avoid concurrent writes to the same files or shared test services, and verify the integrated result.

## Communication

Robert has technical experience but is not overly technical. Lead with the outcome, use plain language and explain unfamiliar technical terms briefly. Keep progress updates focused on findings, decisions and blockers. Report what changed, verification results and remaining limitations without a work-log transcript.

## Documentation and evidence

Maintain current contracts, important rationale, the live work queue and concise final evidence. Do not preserve a running diary of every attempt, tool call, branch state or handoff. A document is not valuable merely because an earlier agent created it.

Update the active deliverable's evidence record in place. Keep unresolved findings explicit; when the deliverable is accepted, consolidate failed attempts and repairs into the final result, meaningful resolutions and verification needed to support acceptance. Do not erase failures that still affect the result. Current facts must not require interpreting several superseded status paragraphs.

At phase closeout, compact completed tasks and evidence into a final phase acceptance record with candidate, outcome, PR/review references, necessary verification details and any continuing obligations. Keep active work and evidence needed by later phases detailed enough to use. Preserve performance baselines, schema/retained-data proof and pending release operations. A local acceptance is not a deployment claim.

Historical details that remain useful may be linked at an exact committed revision. Verify the referenced content is actually committed and retain necessary results or reproduction information when an old record only points to an ephemeral local log. Do not move obsolete material into an archive directory or add another parallel status system. Repair active links and executable documentation consumers when consolidating.

Preserve current decisions and non-obvious constraints, but consolidate duplicated rationale in its canonical owner. Remove superseded or abandoned prose after its remaining useful facts and consumers are handled. Do not delete unresolved work, required legal/security/operational guidance, applied migration history or governance inputs merely to reduce file count. Owned current provider adapters and their guarantees remain valid infrastructure.

## Completion checks

The [verification contract](../architecture/DEFINITION_OF_DONE.md#required-commands) selects checks by change type and owns evidence requirements. Documentation-only work follows its documentation checks; application changes require the full sequence. Keep failed or unavailable acceptance evidence explicit.

Record each required check as passed, failed or unavailable, with enough provenance to support the claim. Reuse applicable valid evidence; do not rerun unchanged checks solely to rewrite their results. Missing required flow evidence or failed tests keeps its owning acceptance open. Notify Robert when a completed schema change needs a separately operated remote migration before merge; never run it as part of local verification.

## Stabilization tasks

Phase activation, next-task selection and deliverable handoffs use the [stabilization workflow](stabilization-workflow.md). Its checkpoints do not apply to unrelated documentation or tooling work. Historical-preservation wording in old task records means preserving material facts and acceptance provenance, not keeping every intermediate paragraph in the current working tree.

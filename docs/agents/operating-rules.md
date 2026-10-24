# Agent operating rules

## Scope and decisions

Complete the authorized outcome, including required consumers, cleanup and verification. Routine local edits, read-only investigation and the prescribed local checks need no further approval. Inspect lifecycle scripts and environment targets before commands that could reach services or data; database work follows the [isolated database checks](../architecture/DEFINITION_OF_DONE.md#isolated-database-checks) and the [data protections](../../AGENTS.md).

Resolve routine choices from the current request and prior authorization. Ask a focused question when missing information would materially change the result or an action needs authorization not yet given, and continue independent work meanwhile. A status question or correction steers the active task; it does not cancel remaining work.

When a repo or skill instruction requires a pause, link the file, quote the rule and name the unresolved decision. Prepare the reviewable result before asking for an external action. Publication, communication, merge and deployment need authorization covering that action; a local implementation request does not supply it. Robert's own "ship it" (the global `ship-it` skill) authorizes that change's actions as the skill lists them (publication, review-thread replies, `run-ci` and the merge).

Skills support the requested workflow; they add no scope or external-action permission. Avoid concurrent writes to the same files or shared test services, and verify the integrated result. Keep one review path proportional to risk: equivalence for mechanical changes, deeper review for authorization, persistence or changed behavior. Optional style suggestions are not gates.

For owner-accepted non-blocking bugs, use authorized tracker publication to file a concise GitHub issue with `chore` and the appropriate triage label. Put the likelihood of hitting it in normal work at the top, with a short rationale.

## Skills and project workflows

Keep one workflow coordinator. Read-only questions stay read-only. Where the invoked skill pack's defaults differ:

- Keep short tasks local. Delegate useful independent work and explore alternatives for consequential uncertainty; crossing a function boundary alone does not require an arena or delegated implementation.
- Derive expected behavior from approved requirements and follow the [testing strategy](../architecture/TESTING.md). Preserve required provider and permission boundaries even when they have one implementation.
- Prove app behavior with the repository's [verify-trooptotask](../../.agents/skills/verify-trooptotask/SKILL.md). The local [create-verification-skill](../../.agents/skills/create-verification-skill/SKILL.md) and [maintain-verification-skill](../../.agents/skills/maintain-verification-skill/SKILL.md) own explicitly requested verification-tooling work. Use these local paths, not same-named global skills.
- Which review bots run changes over time, and at least one reviews every PR. Assess each comment on its merits. Do not wait on a bot that reports a rate limit or skip.
- No Graphite or stack topology changes.

## Communication

Robert has technical experience but is not overly technical. Lead with the outcome, use plain language and briefly explain unfamiliar terms. Report what changed, verification results and remaining limitations without a work-log transcript.

## Completion checks

The [Definition of Done](../architecture/DEFINITION_OF_DONE.md#required-commands) selects checks by change type. Follow [verification after a fix](../architecture/DEFINITION_OF_DONE.md#verification-after-a-fix) for repair and review rounds. Record each required check as passed, failed or unavailable, and keep the task open when required evidence is missing. Tell Robert before merge when a schema change needs a separately operated remote migration; never run it yourself.

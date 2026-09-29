---
name: t2t-engineer
description: Apply TroopToTask contracts, affected-baseline verification and independent acceptance to investigations, features, bug fixes, refactors and engineering reviews.
---

# Engineer TroopToTask changes

Apply these project requirements to the requested work. [Operating rules](../../../docs/agents/operating-rules.md#shared-skills-and-project-workflows), [retained contracts](../../../docs/stabilization/BASELINE.md#retained-contracts) and the [Definition of Done](../../../docs/architecture/DEFINITION_OF_DONE.md#required-commands) own project gates. The request sets scope and authority; a read-only investigation stays read-only.

Keep the current coordinator: [t2t-stabilize](../t2t-stabilize/SKILL.md) for stabilization continuation, or an explicitly invoked Poteto Mode and its selected playbook for other work. This skill supplies project requirements and selected methods without starting another Poteto workflow. Direct invocation also works without Poteto. Phase activation and closure remain with the [stabilization workflow](../../../docs/agents/stabilization-workflow.md); finishing an issue does not authorize the next issue or phase.

## Use the relevant engineering method

Resolve shared skills from the installed `pstack-for-codex` plugin and read the relevant leaf before applying it. Use these methods when they answer a real question; do not load the whole package or turn the list into mandatory stages. The project integration rules above govern differences in delegation, testing, boundaries and delivery.

- For investigation, use `how` to trace a subsystem, `why` when history matters, and `principle-fix-root-causes` for diagnosis. Trace the symptom through the route, feature owner, server policy and provider boundary. Reproduce at the cheapest stable surface and distinguish observations, supported explanations and inference; identify what evidence would disprove the diagnosis.
- For consequential design uncertainty, use `architect` or Poteto's Prototype playbook to compare caller use, types, ownership or observable behavior. Routine edits need no arena. Use `principle-model-the-domain` when state or repeated shape assumptions need an explicit model.
- During implementation, apply relevant simplicity, boundary and caller-migration leaves, such as `principle-laziness-protocol`, `principle-subtract-before-you-add`, `principle-boundary-discipline` and `principle-migrate-callers-delete-legacy-apis`. Change owners and affected consumers together; remove obsolete paths in the same slice. Consider requests, payloads and feedback latency. Approved behavior changes update contracts, feature recipes and relevant lower-level tests together.
- For uncertain consumer impact or contested design, use `blast-radius` or `interrogate` proportionally. Their reports inform acceptance; they do not replace required live observations or independent acceptance.

## Establish the affected baseline

Derive expected outcomes from the request, issue acceptance and approved contracts. Read relevant [feature recipes](../verify-trooptotask/features/README.md) and lower-level tests. Correct missing instructions, fixture roles and small reusable controls before the affected cutover; this is engineering work within the assignment, not a reason to ask Robert for another task.

Use local [verify-trooptotask](../verify-trooptotask/SKILL.md) to drive affected unchanged behavior and dependencies, including relevant failure, access and persistence paths. Preserve meaningful unit/integration/SQL protection under [Testing strategy](../../../docs/architecture/TESTING.md). Direct authenticated API/SQL proof stays separately identified and cannot substitute for UI interaction.

A bug fix may start from a failing reproduction; a refactor requires its affected baseline to pass. Repair authorized baseline defects or identify their owner/dependency. Never adopt a defect as expected behavior. Escalate genuine product ambiguity or missing authority, not missing recipes or helpers. New behavior needs approved expected outcomes; baseline proof covers the existing paths it affects.

## Verify and arrange independent acceptance

Repeat affected live verification and applicable repository checks on the final candidate. Record version, environment, role, actual actions, expected/observed results and durable sanitized artifacts under the [evidence contract](../../../docs/architecture/DEFINITION_OF_DONE.md#recording-evidence). Keep baseline, final, failed and unrun paths distinct. Routine work covers affected features and dependencies; full-map upkeep remains a separate request.

Independent acceptance reviews the complete diff, requirements, direct/reverse consumers, coverage selection and actual evidence. An isolated reviewer may execute live paths; artifact review is not independent execution, and the same model is not model diversity. Proof of one feature's happy path does not establish another feature's failure or isolation behavior. For intermediate stabilization PRs, apply [scoped acceptance](../t2t-stabilize/SKILL.md#bound-the-pr-without-shrinking-the-issue) while keeping the issue remainder and failures visible.

Inspect the final diff for intent, security, consumers, performance and unrelated changes. Explain resulting behavior, important files, checks and material limits against the exact candidate. Use the repository's [finish-pr](../finish-pr/SKILL.md) for authorized PR work and t2t-stabilize's proportional CodeRabbit flow during issue continuation. Publication, merge, deployment, messages and database actions require their existing authority; this skill adds none.

## Bound parallel work

The coordinator owns scope, shared contracts, integration and final acceptance. Use at most two bounded workers on isolated branches/worktrees and separate `verify:app --worker 1|2` services when driving. Each brief names one outcome, exclusive files/services, preserved behavior, checks and evidence. Coordinate shared controls/fixtures explicitly, use one driver per browser and freeze executable inputs during proof. Reconcile results before the PR boundary; workers cannot expand scope or publish overlapping PRs.

Read-only investigation/review needs no browser. Short tasks stay local; no particular model family is required. Fix an identified failure and repeat affected checks. Persistent environment failure remains unavailable evidence rather than an endless retry loop.

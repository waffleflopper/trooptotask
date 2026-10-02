# Agent Operating Rules

## Scope and decisions

Complete the authorized outcome, including required consumers, cleanup and verification. Routine local edits, read-only investigation and the prescribed local checks do not need another approval. Inspect lifecycle scripts and environment targets before commands that could reach services or data; database work follows the [isolated database contract](../architecture/DEFINITION_OF_DONE.md#isolated-database-checks) and root [data protections](../../AGENTS.md).

Use the user's current request and prior authorization to resolve routine choices. Ask a focused question when missing information would materially change the result or an action needs authorization not already supplied. Continue independent work while that question is pending. A status question or correction steers the active task; it does not cancel the remaining work unless the user says so.

If a repo or skill instruction requires a pause, link the exact file, quote the relevant rule and explain the concrete unresolved decision. Distinguish an explicit requirement from an inferred preference. Prepare the reviewable result before requesting approval for an external action. Publication, communications, merge and deployment require authorization covering that action; a local implementation request alone does not supply it.

Skills support the requested workflow; they do not add scope or external-action permission. A historical skill name in a reference is not a dependency on an unavailable tool. Follow the current session's delegation policy; use bounded independent investigations or reviews when authorized and useful. Avoid concurrent writes to the same files or shared test services, and verify the integrated result.

Scope implementation searches to the owning source paths and affected callers, tests, scripts and SQL. Open relevant current contracts and feature recipes deliberately; search historical receipts or extract evidence archives into ignored scratch space when their provenance is needed. This keeps captured output and obsolete plans from crowding ordinary source searches.

Use [t2t-engineer](../../.agents/skills/t2t-engineer/SKILL.md) for engineering modes and bounded worker briefs, and [verify-trooptotask](../../.agents/skills/verify-trooptotask/SKILL.md) for live app proof and Feature Map maintenance. Keep one primary review path proportional to risk: equivalence and ownership for mechanical changes, deeper review for authorization, persistence or changed behavior. Unrelated style suggestions do not become acceptance gates. Stop review when consequential findings are resolved; do not target zero suggestions or retry unavailable services indefinitely.

## Shared skills and project workflows

Use the shared `pstack-for-codex` plugin from [Robert's fork](https://github.com/waffleflopper/pstack-for-codex) for reusable methods. Resolve its skills through the installed catalog and read their resources relative to the owning skill; do not hardcode a user-home cache path or duplicate the package into this repository. Read only the relevant leaf skills or playbook. If a method is unavailable, report that limit and continue work whose requirements can still be met with available tools.

Keep one workflow coordinator. An invoked Poteto Mode selects the general playbook and applies [t2t-engineer](../../.agents/skills/t2t-engineer/SKILL.md) for TroopToTask requirements. [t2t-stabilize](../../.agents/skills/t2t-stabilize/SKILL.md) owns stabilization continuation and calls selected pstack methods through t2t-engineer without starting another Poteto workflow. Read-only questions stay read-only. Neither entry point changes the current stabilization priority or supplies external-action authority.

Apply these project choices where shared defaults differ:

- Keep short tasks local. Use bounded delegation for useful independent work and design alternatives for consequential uncertainty; crossing a function boundary alone does not require an arena or delegated implementation. Existing tools and evidence may suffice without adding a script for every nontrivial change.
- Derive expected behavior from approved contracts. Follow [Testing strategy](../architecture/TESTING.md), including its protection of meaningful authorization and accessibility assertions and its exclusions for structural/visual snapshots. Preserve required provider and permission boundaries even when they have only one implementation; redesign advice does not authorize surrounding rebuilds.
- Use the repository's [verify-trooptotask](../../.agents/skills/verify-trooptotask/SKILL.md), feature map and helpers for app proof. The local [create-verification-skill](../../.agents/skills/create-verification-skill/SKILL.md) and [maintain-verification-skill](../../.agents/skills/maintain-verification-skill/SKILL.md) own explicitly requested verification-tooling work. Resolve these local paths rather than same-named global skills.
- Use the local [finish-pr](../../.agents/skills/finish-pr/SKILL.md) for PR feedback and CI. It and t2t-stabilize's owner-merge boundary take precedence over Poteto's Babysit, Shipping and Opening a PR defaults. Do not introduce Graphite, stack topology changes, automatic publication, or merges through a generic playbook. Preserve unrelated work when arranging branches and commits.
- Keep evidence in the existing task record under the [recording contract](../architecture/DEFINITION_OF_DONE.md#recording-evidence); a generic decision-trail skill does not require a second ledger. Project checks and declared acceptance remain required; optional review suggestions do not become additional gates.

## Communication

Robert has technical experience but is not overly technical. Lead with the outcome, use plain language and explain unfamiliar technical terms briefly. Keep progress updates focused on findings, decisions and blockers. Report what changed, verification results and remaining limitations without a work-log transcript.

## Completion checks

The [verification contract](../architecture/DEFINITION_OF_DONE.md#required-commands) selects checks by change type and owns evidence requirements. Documentation-only work follows its documentation checks; application changes require the full candidate sequence, which may run in GitHub Actions. Use focused checks locally; pushes do not require repeating the full suite. Record pending hosted checks at publication handoff, and verify actual results before acceptance. Keep failed or unavailable acceptance evidence explicit.

Record each required check as passed, failed or unavailable. Missing flow evidence, failed tests and unavailable tools remain explicit; keep the owning task open when that evidence is required for acceptance. Notify Robert when a completed schema change needs a separately operated remote migration before merge; never run it as part of local verification.

## Stabilization tasks

Phase activation, next-task selection and deliverable handoffs use the [stabilization workflow](stabilization-workflow.md). Its checkpoints do not apply to unrelated documentation or tooling work.

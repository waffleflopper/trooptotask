# ADR 0001: V1 Authorization Replacement Model

Status: Accepted
Date: 2026-04-21

## Context

### Current-state truth

- v1 organization authorization is anchored on organization membership plus:
  - persisted membership role: `owner`, `admin`, or `member`
  - stored member preset
  - per-feature capability overrides
  - shared scope set
  - policy overlays
- Current UI presets use `Viewer`, `Operator`, and `Editor` as first-class member-access shapes.
- Explainability comes from the fixed governance role, assigned preset, capability map, scope set, and policy overlays.
- Critical Tasks and Rating Scheme own dedicated feature lanes.
- Platform admin uses a separate role system (`super_admin`, `support`, `billing`) and is not part of organization-membership authorization.

### Decision pressure

- Issue [#614](https://github.com/waffleflopper/trooptotask/issues/614) requires a concrete replacement v1 authorization model and migration plan without implementing runtime authz changes in this slice.
- Drift entry `D-03` depends on a shared source of truth before implementation slices can land safely.

## Decision

- Keep `Organization` and `Group` as canonical v1 nouns.
- Keep `owner`, `admin`, and `member` as the fixed organization-governance roles.
- Treat `owner` and `admin` as fixed, high-trust, org-wide governance roles:
  - `admin` should be able to perform the same normal organization-governance work as `owner`
  - ownership transfer and destructive organization-danger operations such as deleting the organization remain `owner`-only
- Do not use member customization to create partial admins.
- Model member access as:
  - assigned member preset
  - explicit per-feature capability overrides
  - shared scope set
  - policy overlays that can still change the final allow/deny decision
- Policy evaluation should be action-first. Routes, pages, and buttons should request decisions for stable policy actions, and every action should be owned by a durable feature lane or organization-governance semantics.
- The first action catalog should use workflow-level actions, splitting actions when capability level, audit treatment, or UX explanation needs differ.
- The replacement should proceed through vertical authorization slices, filed as implementation issues, that carry one meaningful workflow through storage, adapter, evaluator, route enforcement, UI affordance, audit behavior, and tests together.
- The core policy evaluator should be pure TypeScript and provider-agnostic. Supabase-specific reads belong in an adapter that translates provider data into policy inputs.
- Policy evaluation should return a structured decision result rather than a bare boolean, including explanation fields for UX and audit use.
- Every policy decision should include a stable machine-readable reason code; human-facing copy should be mapped from reason codes outside the evaluator.
- Audit capture should be selective. Policy decisions should carry enough fields for audit events, while an audit adapter or allowlist persists denied writes, organization-governance actions, owner-only actions, billing changes, member-management changes, and suspicious denied access patterns.
- Ordinary allowed reads should not be audited by default.
- Policy enforcement must be server-authoritative. Client-side or preloaded decisions are advisory UX hints only; writes and sensitive reads must still be checked server-side.
- Use `Viewer`, `Operator`, and `Editor` as the starter member presets.
- Keep presets platform-defined in this phase. Do not add organization-defined saved custom presets yet.
- Preserve preset lineage for auditability. A manual change does not sever the preset relationship; it creates explicit overrides against the assigned preset.
- Model feature authority as a lane-by-lane capability map with levels:
  - `none`
  - `view`
  - `operate`
  - `configure`
- Model scope as a shared member scope set across all scoped feature lanes:
  - organization-wide
  - one or more `Group`s
- Do not reserve personnel-specific member scope storage in the v1 replacement model. If personnel-scoped access becomes necessary later, introduce it through a new ADR or approved slice that defines its policy semantics, RLS behavior, UI affordances, and audit behavior together.
- Do not introduce per-feature scope matrices in the replacement model.
- Treat read-only billing locks, delete-approval workflows, and owner-only danger operations as explicit policy overlays rather than part of the feature capability ladder itself.
- Name the intended first-class v1 feature lanes now:
  - `calendar`
  - `personnel`
  - `training`
  - `critical-tasks`
  - `onboarding`
  - `rating-scheme`
- Require every member's effective access to remain explainable as:
  - fixed governance role
  - assigned preset
  - lane-by-lane capability map
  - shared scope set
  - policy overlays

## Rejected Or Deferred Alternatives

- Flatten the model so only `owner` remains special and `admin` becomes just another preset or capability bundle.
  - Rejected because organization-governance powers become harder to explain, migrate, and audit.
- Allow customizable or decomposable admins.
  - Rejected because governance over other people's access should stay fixed and auditable rather than turning into hidden partial-admin drift.
- Make group-scoped access a named replacement preset.
  - Rejected because scope should compose with member capabilities rather than being embedded in preset names.
- Allow per-feature scope matrices.
  - Rejected because they add complexity the current product model does not require and they are not aligned with the desired v1 mental model.
- Hide member access behind a long-lived compatibility adapter.
  - Rejected because compatibility shells make the durable member-access model harder to inspect and evolve.
- Require a single big-bang authorization migration.
  - Rejected because the replacement can be safer and more agent-executable as multiple vertical slices.
- Add organization-defined saved presets in the first rollout.
  - Deferred because platform-defined starter presets plus explicit overrides already cover the approved flexibility without complicating migration or auditability.

## Guardrails And Exceptions

- Do not invent partial-admin member shapes.
- Do not introduce per-feature scope matrices.
- Treat Critical Tasks and Rating Scheme lane borrowing as drift until dedicated implementation slices remove those couplings.
- Keep platform admin separate from organization-membership authorization.

## Consequences

- Expected benefits:
  - clearer separation between org governance and day-to-day feature authority
  - durable, selective auditability for presets, overrides, scope, policy overlays, denied or suspicious access attempts, and sensitive successful actions
  - a cleaner path for separating Critical Tasks and Rating Scheme into first-class lanes
  - member flexibility without muddying admin / owner responsibilities
- Tradeoffs:
  - follow-up slices still need to define exact `operate` versus `configure` actions per feature
  - action catalog granularity will need active stewardship so it does not drift into button-level permissions or broad catch-all feature edits
- New risks or migration costs:
  - docs can outrun implementation if follow-up slices do not land in a staged way
  - lane separation work must keep Rating Scheme independently owned

## Rollout And Follow-Up

- Do not implement runtime authz changes in this slice.
- Implementation should be split into vertical authorization issues rather than a long-lived compatibility shell.
- Vertical authorization slices should cover:
  - explicit feature-lane mapping and documentation against this ADR
  - Critical Tasks lane separation from Training
  - Rating Scheme lane separation from borrowed adjacent lanes
  - policy overlay coverage for member-facing workflows
- Docs updated with this ADR:
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/ADR_BACKLOG.md`
  - `UBIQUITOUS_LANGUAGE.md`

## Links

- Related issue: [#614](https://github.com/waffleflopper/trooptotask/issues/614)
- Related drift IDs: `D-03`
- Related docs:
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/ADR_GUIDANCE.md`
  - `UBIQUITOUS_LANGUAGE.md`

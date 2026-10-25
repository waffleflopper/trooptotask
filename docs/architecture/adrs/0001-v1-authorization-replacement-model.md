# ADR 0001: Organization authorization model

## Decision

- `owner`, `admin` and `member` are fixed Organization governance roles. `admin` does the same governance work as `owner`, except that changing an admin's access, transferring ownership, deleting the Organization and reading audit logs stay owner-only.
- A member's access is an assigned preset (`viewer`, `operator` or `editor`), explicit per-lane capability overrides against that preset, and one shared scope set. A manual change keeps the preset and records an override.
- Capability levels are `none`, `view`, `operate` and `configure`.
- The durable feature lanes are `calendar`, `personnel`, `training`, `criticalTasks`, `onboarding` and `ratingScheme`. Page or route placement never defines lane ownership. Rating Scheme is grantable independently of Personnel even though it renders inside Personnel.
- Member management, Organization settings and owner-only danger operations are governance, not feature lanes. Delete approval and owner-only operations are policy overlays, not capability levels.
- The scope set is either the whole Organization or a list of Groups, shared by every scoped lane.
- The policy evaluator is pure TypeScript. It returns a structured decision with a stable reason code. Supabase reads live in an adapter that builds its inputs.
- The server is authoritative. Client-side decisions are UX hints only.
- Platform Administration belongs to one operator, identified by a row in `platform_operators`. It has no roles or management UI and never grants Organization membership. Operator admission requires MFA at `aal2`.

## Why

Fixed governance roles keep "who controls other people's access" auditable. Customizable admins would hide partial-admin authority inside capability maps. Composing scope with capabilities, instead of naming scoped presets, keeps every member's access explainable as role, preset, capability map and scope set.

## Constraints

- Do not create partial-admin member shapes.
- Do not add per-feature scope matrices or personnel-level member scope. Either needs a new ADR covering policy, RLS, UI and audit together.
- Do not let one lane borrow another lane's permission.
- Do not add Organization-defined saved presets without a new decision.
- Audit denied writes, governance actions, owner-only actions and member-access changes. Do not audit ordinary allowed reads.

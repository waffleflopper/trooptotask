Implement issue #{arg(1)} on a dedicated branch named `codex/#-short-description`.

Use:

- `trooptotask-v2-issue`
- `tdd` for all code-bearing behavior changes
- `trooptotask-v2-authz` if this touches authorization, roles, grants, scopes, capabilities, access checks, or RLS
- `trooptotask-v2-migration` if this touches v1 reference material, parity ledgers, migration mapping, or migrated v1 behavior
- `impeccable craft` (or appropriate skill listed in .impeccable.md) if this creates or changes user-visible UI
- `trooptotask-v2-slice-audit` before final completion

Before editing:

- Follow the required context rules in `AGENTS.md`.
- Read the issue.
- Read relevant package READMEs and referenced ADRs.
- Read `docs/architecture/DEFINITION_OF_DONE.md`.
- Read `docs/architecture/ARCHITECTURE.md` if this changes package boundaries, provider usage, auth, billing, data access, or authorization.
- Do not load the full project plan unless the issue specifically requires it.

TDD:

- Write one behavior test through a public interface.
- Make it pass with minimal implementation.
- Repeat one behavior at a time.
- Refactor only when green.
- Do not write all tests first and all implementation afterward.

Hard constraints:

- Do not deep-import across packages.
- Do not use provider SDKs outside adapter packages.
- Do not add production dependencies without an ADR.
- Do not apply or copy v1 schema, RLS, or permission booleans into v2.
- Do not introduce a separate `Unit` aggregate/table/package/route unless an accepted ADR explicitly reintroduces it.
- Do not make Clerk roles/permissions the source of truth for app authorization.
- Enforce authorization server-side where relevant.
- Update ADRs, parity docs, migration mapping, security docs, and package READMEs when relevant.
- Keep the PR scoped to the issue only.
- If a needed decision is HITL or ambiguous, stop and ask. Do not infer my answer.

When done:

- Run `pnpm verify` if it exists.
- If `pnpm verify` does not exist, run:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm check`
  - `pnpm test`
  - `pnpm check:architecture`
  - `pnpm check:package-readmes`
  - `pnpm check:v1-reference`
  - `pnpm parity:check`
- Run relevant Playwright smoke tests if this changes a user-visible flow.
- Use `trooptotask-v2-slice-audit` to compare the completed work against the issue body, acceptance criteria, tests required, and Definition of Done.

Final response:

- Summarize what changed.
- List tests/checks run.
- Note ADR, parity, security, migration, or package README updates.
- Note skipped checks with the reason.
- Note follow-up issues or HITL decisions.

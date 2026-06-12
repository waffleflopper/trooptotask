# Plan 030: Patch high-severity build-tool audit advisories

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- package.json package-lock.json plans/013-dependency-vulnerability-triage.md plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

Plan 013 fixed the prior critical Vitest advisory and explicitly accepted old moderate/low audit
noise. A fresh audit on 2026-06-12 now reports 6 high vulnerabilities and 0 criticals, concentrated
in the build/test toolchain (`vite`, `vitest`, `vite-node`, `@vitest/mocker`, `esbuild`, and
`@sveltejs/adapter-vercel`). This is not a request-handler runtime bug, but it affects CI/local
install, tests, and Vercel packaging. After this plan, `npm audit --audit-level=high` should pass
or have a documented, explicit acceptance if npm cannot resolve a patched path safely.

## Current state

- `package.json:59-60`:

```json
"vite": "^8.0.10",
"vitest": "^3.2.4"
```

- `package.json:71`:

```json
"@sveltejs/adapter-vercel": "^6.3.2"
```

- `package-lock.json:5778-5780` resolves root `esbuild` to `0.27.7`.
- `package-lock.json:10067-10069` resolves `vitest` to `3.2.6`.
- Fresh command result at commit `a2b09628`:

```text
npm audit --audit-level=high --json
metadata.vulnerabilities = { low: 6, moderate: 2, high: 6, critical: 0, total: 14 }
high path = @sveltejs/adapter-vercel, @vitest/mocker, esbuild, vite, vite-node, vitest
```

- `plans/README.md:70-73` says plan 013 accepted old `exceljs`/`uuid` moderate issues and
  `@sveltejs/*`/`bits-ui` lows, and fixed the previous critical Vitest advisory. Do not undo those
  recorded acceptances with downgrade-only fixes.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Audit inventory | `npm audit --audit-level=high --json` | exits 0, or only documented accepted non-high findings remain |
| Build sanity | `npm run build` | exit 0 |
| Format | `npm run format` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Governance | `npm run governance:check` | exit 0 |
| Typecheck | `npm run check` | exit 0 |
| Full tests | `npm run test` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `package-lock.json`
- `plans/README.md` status row only

**Out of scope**:

- Do not downgrade `exceljs`, `bits-ui`, `@sveltejs/kit`, or adapters merely because npm suggests
  downgrade-only fixes for already accepted low/moderate advisories.
- Do not refactor tests to accommodate a toolchain change unless a real Vitest/Vite compatibility
  break requires it.
- Do not change application source code unless a dependency upgrade causes a compile error that is
  clearly part of the toolchain migration; if that happens, keep it minimal and report it.

## Git workflow

- Branch: `advisor/030-patch-high-severity-build-tool-advisories`
- Commit style: short imperative subject. Suggested: `Patch build tool audit advisories`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reproduce and inventory the audit

Run:

```bash
npm audit --audit-level=high --json
```

Capture the high-severity package names and the suggested patched versions. Confirm the result is
still about the Vite/Vitest/esbuild toolchain. If the high advisories are already gone, skip to the
README/status update and report that the plan was satisfied independently.

**Verify**: command output either shows the high toolchain path or exits 0.

### Step 2: Try the smallest safe lockfile/package update

Attempt a minimal npm update path that moves `esbuild`, `vite`, and Vitest-related transitive
packages outside the vulnerable ranges while keeping the existing major versions where possible.

Acceptable approaches:

- `npm update vite vitest @sveltejs/adapter-vercel` if it resolves patched versions,
- or package `overrides` only if npm can install/test cleanly and the override does not force an
  unsupported dependency combination.

Do not apply npm's downgrade-only suggestions for the already accepted low/moderate advisories.

**Verify**: `npm audit --audit-level=high --json` -> no high vulnerabilities.

### Step 3: Escalate to Vitest/Vite major migration only if needed

If Step 2 cannot remove the high advisories, upgrade the direct toolchain packages together:

- `vitest` to the patched line npm recommends,
- compatible `vite`,
- compatible SvelteKit/Vercel adapter versions if required by peer dependency resolution.

After the install, run focused test commands first. Fix only toolchain-compatibility failures, such
as changed Vitest mock behavior or config shape.

**Verify**: `npm run check && npm run test` -> both exit 0.

### Step 4: Confirm build and full gate

Run:

```bash
npm run build
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
npm audit --audit-level=high --json
```

Expected: all commands exit 0. If only low/moderate advisories remain and they are the already
accepted downgrade-only findings, leave them documented in `plans/README.md`.

## Done criteria

- [ ] `npm audit --audit-level=high --json` exits 0, or any remaining high advisory has an explicit
  reviewer-approved acceptance recorded in `plans/README.md`.
- [ ] `package-lock.json` no longer resolves vulnerable Vite/Vitest/esbuild packages in the high
  advisory path.
- [ ] `npm run build`, `npm run check`, and `npm run test` exit 0.
- [ ] No application behavior changes are mixed into this dependency slice.
- [ ] `plans/README.md` status row for 030 is updated.

## STOP conditions

Stop and report back if:

- npm can only remove the high advisories by downgrading core SvelteKit/app dependencies.
- Vitest 4 or a Vite major upgrade creates broad test failures that require product-code changes.
- Vercel adapter peer dependencies conflict with the SvelteKit version in a way that needs a
  deployment decision.

## Maintenance notes

This plan supersedes only the high-severity toolchain portion of the old dependency triage. The
old `exceljs`/`uuid` and `bits-ui` acceptances remain separate until their upstream packages offer
safe forward fixes.

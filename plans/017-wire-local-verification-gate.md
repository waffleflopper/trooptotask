# Plan 017: Wire the local verification gate — gate script, active pre-push hook, .env.example

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- package.json .githooks scripts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

Automatic CI triggers are intentionally disabled in this repo (GitHub usage limits — do NOT
re-enable them), which makes the local gate the only safety net before code reaches `main`.
That net currently has three holes: (1) a complete pre-push hook exists at `.githooks/pre-push`
but is inert — `core.hooksPath` points at the default `.git/hooks`, so nothing runs it;
(2) there is no single command that runs all five required gates (CLAUDE.md lists them
individually; every agent and human must remember the sequence); (3) there is no `.env.example`,
so a fresh clone discovers required env vars by hitting the startup validator. This plan adds
`npm run gate`, makes hook installation automatic-but-reversible, and version-controls an env
template.

## Current state

- `package.json:10-34` — scripts include `format`, `format:check`, `lint`, `governance:check`,
  `check`, `test`, `db:test`, `test:e2e`, etc. There is **no** combined gate script. The
  `postinstall` script (line 12) runs `node ./scripts/patch-bits-ui-timers.mjs`. There is no
  `prepare` script.
- `.githooks/pre-push` — exists and is correct:

```sh
#!/bin/sh
set -eu

echo "Running local pre-push checks..."

npm run format:check
npm run lint
npm run governance:check
npm run check
npm run test

echo "Local pre-push checks passed."
```

- `git config core.hooksPath` currently returns
  `/Users/robertbaddeley/Projects/trooptotask/.git/hooks` — i.e. the `.githooks/` directory is
  NOT active. Nothing in the repo (postinstall, README) wires it up.
- `.env.example` does not exist. `README.md:117` tells developers to "Create a `.env` file with
  your Supabase credentials" with a partial inline example; `README.md:80` also says
  "**Framework**: SvelteKit 2.5 + Svelte 5 (runes)" (stale — package.json has kit ^2.61).
- The authoritative env-var inventory is `src/lib/server/env.ts` (startup validator):
  required — `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
  optional — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEAM_PRICE_ID`,
  `STRIPE_UNIT_PRICE_ID`, `STRIPE_TEAM_LEGACY_PRICE_IDS`, `STRIPE_UNIT_LEGACY_PRICE_IDS`,
  `STRIPE_AUTOMATIC_TAX_ENABLED`, `STRIPE_TAX_DASHBOARD_VERIFIED`, `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, `ACCOUNT_SETUP_SESSION_SECRET`, `APP_PUBLIC_ORIGIN`,
  `APP_PUBLIC_ORIGIN_ALLOWLIST`, `PUBLIC_APP_ORIGIN`, `PUBLIC_SITE_URL`. Additionally
  `PUBLIC_BILLING_ENABLED` gates billing (`src/lib/config/billing.ts`), and the cron endpoints
  read `CLEANUP_SECRET` / `CRON_SECRET` (`src/lib/server/cronEndpointAuth.ts` callers under
  `src/routes/api/`). Verify this inventory against `env.ts` at execution time and include
  anything new.
- Deployment note: the app deploys on Vercel (`@sveltejs/adapter-vercel`), where `npm install`
  also runs lifecycle scripts — any hook-installation script must be a silent no-op outside a
  usable git worktree or when `CI`/`VERCEL` env is present.

## Commands you will need

| Purpose           | Command                     | Expected on success                 |
| ----------------- | --------------------------- | ----------------------------------- |
| Gate (new)        | `npm run gate`              | runs all five checks, exit 0        |
| Hook wiring check | `git config core.hooksPath` | `.githooks`                         |
| Hook smoke test   | `sh .githooks/pre-push`     | all checks pass, exit 0             |
| Install lifecycle | `npm install`               | exit 0; bits-ui patch still applies |
| Full suite        | `npm run test`              | exit 0                              |

## Scope

**In scope** (the only files you should create/modify):

- `package.json` (add `gate` and `prepare` scripts only)
- `scripts/setup-githooks.mjs` (create)
- `.env.example` (create)
- `README.md` (env section + gate documentation + the stale "SvelteKit 2.5" line)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- `.github/workflows/` — automatic CI triggers stay disabled; this plan must not add any.
- `.githooks/pre-push` content — it already matches CLAUDE.md's required gates
  (`format:check` in the hook vs `format` in CLAUDE.md is intentional: hooks must not mutate
  the tree).
- `scripts/patch-bits-ui-timers.mjs` and the existing `postinstall` wiring.
- `src/` — no app code.
- The user's actual `.env` / `.env.local` files — never read their values into anything
  committed.

## Git workflow

- Branch: `advisor/017-wire-local-verification-gate`
- Commit style: short imperative subject. Suggested: `Wire local verification gate and env template`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `gate` script

In `package.json` scripts, add (keeping alphabetical-ish neighborhood with the other check
scripts):

```json
"gate": "npm run format:check && npm run lint && npm run governance:check && npm run check && npm run test"
```

Sequential on purpose: output stays readable, and `check`/`test` dominate runtime anyway.

**Verify**: `npm run gate` → all five run in order, exit 0.

### Step 2: Auto-install the hooks path, reversibly

Create `scripts/setup-githooks.mjs`:

```js
// Wires .githooks as the repo's hooks path on local installs.
// No-op on CI/Vercel, outside a git worktree, or if the developer
// has pointed hooksPath somewhere custom.
import { execSync } from 'node:child_process';

if (process.env.CI || process.env.VERCEL) process.exit(0);

try {
	const current = execSync('git config core.hooksPath', { stdio: ['ignore', 'pipe', 'ignore'] })
		.toString()
		.trim();
	if (current && current !== '.githooks' && !current.endsWith('/.git/hooks')) {
		// Developer customized hooks — leave it alone.
		process.exit(0);
	}
} catch {
	// Unset hooksPath (or not a git repo) — fall through and try to set it.
}

try {
	execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
	// Not a git repo (e.g. exported tarball) — fine.
}
```

Wire it via the npm `prepare` lifecycle (runs on local `npm install`, not on
`npm ci --omit=dev` production installs) by adding to `package.json` scripts:

```json
"prepare": "node ./scripts/setup-githooks.mjs"
```

Do NOT chain it into the existing `postinstall` (keep the bits-ui patch's failure semantics
isolated). Reversal for any developer who dislikes it: `git config --unset core.hooksPath` —
say so in the README (Step 4).

**Verify**: `npm install` → exit 0, bits-ui patch output still present; then
`git config core.hooksPath` → `.githooks`; then `sh .githooks/pre-push` → exit 0.

### Step 3: Create `.env.example`

Create `.env.example` containing every variable from the "Current state" inventory
(re-derived from `src/lib/server/env.ts` at execution time), grouped
required-first, each with a placeholder value and a one-line comment. Placeholders must be
obviously fake (`your-service-role-key`, `sk_test_xxx`, `whsec_xxx`) — copy **no** value from
any local `.env`, and for the local-Supabase URLs use the standard local defaults already shown
in `README.md:117`'s example block.

**Verify**: `grep -c "=" .env.example` → ≥ 18; and
`git diff --cached` after staging contains no string longer than 30 chars that looks like a real
key (manual scan — placeholders only).

### Step 4: Update README

In `README.md`:

1. Line 80: change "SvelteKit 2.5 + Svelte 5 (runes)" → "SvelteKit 2 + Svelte 5 (runes)"
   (version-floor-free so it can't go stale again).
2. In the setup section (around line 117): point step 4 at `cp .env.example .env` first, keeping
   the existing local-Supabase guidance.
3. Add a short "Verification gate" subsection: `npm run gate` runs all five required checks;
   pre-push runs them automatically (installed by `npm install`; opt out with
   `git config --unset core.hooksPath`).

**Verify**: `grep -n "SvelteKit 2.5" README.md` → no matches; `grep -n "npm run gate" README.md` → ≥1 match.

### Step 5: Full gate (eat your own dog food)

**Verify**: `npm run gate` → exit 0. Then `npm run format` (the write-mode formatter, per
CLAUDE.md) followed by `git status` → no formatter-induced changes outside the in-scope list.

## Test plan

No unit tests — this is tooling. The verification gates above are the test: `npm run gate`
passes, a real `npm install` wires the hook without breaking the bits-ui postinstall, and
`sh .githooks/pre-push` passes end to end.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run gate` exits 0
- [ ] `git config core.hooksPath` → `.githooks` after a fresh `npm install`
- [ ] `.env.example` exists, placeholders only
- [ ] `grep -n "SvelteKit 2.5" README.md` → no matches
- [ ] `npm install` exits 0 with the bits-ui patch still applying
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 017 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `core.hooksPath` is set to something other than `.githooks` or a `.git/hooks` default at
  execution time — the operator may have customized hooks deliberately; report the value.
- `src/lib/server/env.ts` has gained env vars whose purpose you cannot determine from code —
  list them in `.env.example` only with a `# TODO: document` comment and flag them in your
  report; do not guess semantics.
- `npm install` with the `prepare` script breaks on Vercel-like env simulation
  (`VERCEL=1 npm install` should still exit 0) after one fix attempt.
- Anything tempts you to add a CI trigger — hard no per the operator.

## Maintenance notes

- The hook runs the full test suite on every push; if that ever gets slow enough to annoy,
  the right move is making `test` faster or splitting the hook, not silently skipping gates —
  flag it to the operator.
- New env vars must be added to `.env.example` in the same PR that reads them; reviewers should
  start checking for this.
- The `prepare` script intentionally respects custom `hooksPath` values; if the team later
  standardizes on husky or similar, delete `scripts/setup-githooks.mjs` rather than layering.

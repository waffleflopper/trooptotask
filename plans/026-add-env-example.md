# Plan 026: Add a documented .env.example

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79cfef20..HEAD -- src/lib/server/env.ts README.md .gitignore`
> If `src/lib/server/env.ts` changed since this plan was written, re-derive
> the variable list from the live file (Step 1 does this anyway).

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `79cfef20`, 2026-06-11

## Why this matters

README setup step 4 tells a new developer to hand-create `.env` with three keys copied out of
prose, but the app actually understands ~15+ environment variables (Stripe, Resend, cron secrets,
origin allowlist, account-setup session secret) whose authoritative list lives only in
`src/lib/server/env.ts` and scattered server modules. There is no `.env.example` at the repo root
(only `.sandcastle/.env.example`, which belongs to a test fixture tool). A documented
`.env.example` makes setup `cp .env.example .env` + fill-in, and gives every optional subsystem
(billing, email, crons) a discoverable, commented home. Pure DX; no production code changes.

## Current state

- No `.env.example` at the repo root (`ls .env.example` → no such file).
- `.gitignore` ignores `.env`, `.env.local`, `.env.prod`, `.env.*.local` (lines 9–12) — note
  there is NO blanket `.env*` rule, so `.env.example` will be committable as-is. Confirm with
  `git check-ignore .env.example` (expected: exit code 1 = not ignored).
- `src/lib/server/env.ts` — the validated env registry. As of `79cfef20` it names (lines ~59–95):
  - Required: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - Optional (billing): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEAM_PRICE_ID`,
    `STRIPE_UNIT_PRICE_ID`, `STRIPE_TEAM_LEGACY_PRICE_IDS`, `STRIPE_UNIT_LEGACY_PRICE_IDS`,
    `STRIPE_AUTOMATIC_TAX_ENABLED`, `STRIPE_TAX_DASHBOARD_VERIFIED`
  - Optional (email): `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
  - Plus: `APP_PUBLIC_ORIGIN_ALLOWLIST`, `ACCOUNT_SETUP_SESSION_SECRET`
- Cron auth secrets are validated in `src/lib/server/cronEndpointAuth.ts` (grep it for the env
  names — `CLEANUP_SECRET` / `CRON_SECRET`).
- `README.md` lines 117–123 — the manual `.env` instructions (three Supabase keys); line 136 —
  `supabase status -o env` tip for local keys.

## Commands you will need

| Purpose      | Command                                                     | Expected on success      |
| ------------ | ----------------------------------------------------------- | ------------------------ |
| Ignore check | `git check-ignore .env.example; echo $?`                    | prints `1` (not ignored) |
| Format       | `npm run format`                                            | exit 0                   |
| Lint         | `npm run lint`                                              | exit 0                   |
| Full gate    | `npm run governance:check && npm run check && npm run test` | all exit 0               |

## Scope

**In scope** (the only files you should modify/create):

- `.env.example` (create)
- `README.md` (setup step 4 only)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- `src/lib/server/env.ts` and any validation logic — this plan documents, it does not change
  behavior.
- `.gitignore` — already correct.
- `.sandcastle/.env.example` — belongs to the sandcastle tool.

## Git workflow

- Branch: `advisor/026-add-env-example`
- Commit style: short imperative subject. Suggested: `Add documented .env.example`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Derive the authoritative variable list

Read `src/lib/server/env.ts` end to end and `grep -rn "CLEANUP_SECRET\|CRON_SECRET" src/lib/server/cronEndpointAuth.ts`.
Also run `grep -rn "process\.env\.\|\$env/static/private\|\$env/dynamic/private" src/lib/server --include="*.ts" -h | grep -oE "[A-Z][A-Z0-9_]{3,}" | sort -u`
and reconcile against the list in "Current state" — env.ts is authoritative for
required/optional status; anything found only via grep gets documented as optional with a
comment naming the module that reads it.

**Verify**: your final list includes every name from "Current state"; report any new ones.

### Step 2: Write .env.example

Create `.env.example` with placeholder values ONLY — never a real key, not even a test-mode key.
Structure it in commented sections:

```bash
# --- Supabase (required) ---------------------------------------------------
# Local development: run `supabase start`, then `supabase status -o env`
# to print these values. See README "Getting Started".
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key

# --- Stripe billing (optional — app runs without it) -----------------------
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# ... (one commented line per variable from Step 1, with a one-line purpose comment)
```

Required variables get real placeholder lines; optional ones are commented out, except static
public variables that SvelteKit must see during check/build, such as
`PUBLIC_BILLING_ENABLED=false`. Every variable from Step 1 appears exactly once.

**Verify**: `git check-ignore .env.example; echo $?` → prints `1`. And
`grep -c "SUPABASE" .env.example` → ≥3.

### Step 3: Point the README at it

In `README.md`, replace the body of setup step 4 ("Create a `.env` file...") with
`cp .env.example .env` plus filling in the Supabase values, keeping the existing
`supabase status -o env` tip intact. Do not renumber or rewrite other steps.

**Verify**: `npm run format && npm run lint` → exit 0.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.

## Test plan

No code paths change; no tests to write. The done criteria are the verification.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f .env.example` → exit 0
- [ ] `git check-ignore .env.example` → exit code 1
- [ ] `grep -n "cp .env.example .env" README.md` → one match
- [ ] No string matching a real credential pattern in the file: `grep -En "(sk_live|whsec_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9])" .env.example` returns no matches
- [ ] `npm run format:check`, `npm run lint`, `npm run check`, `npm run test` all exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 026 updated

## STOP conditions

Stop and report back (do not improvise) if:

- You find an existing committed `.env`-style file CONTAINING real values anywhere in the repo
  while grepping — do not copy from it, do not delete it; report the path and credential type
  only (never the value) and recommend rotation.
- `env.ts` has been restructured so required/optional status is no longer derivable — report
  rather than guessing.

## Maintenance notes

- When a new env variable is added to `src/lib/server/env.ts`, add it to `.env.example` in the
  same PR — reviewers should treat a missing example entry like a missing migration.
- Deferred: a check that diffs `env.ts` names against `.env.example` (could bolt onto
  `scripts/check-governance.mjs`) — not planned; revisit if the file drifts.

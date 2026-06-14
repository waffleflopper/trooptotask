# Plan 058: Align README runtime setup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- README.md package.json package-lock.json .nvmrc .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

The README tells new contributors to use Node.js 18+ and `npm install`, but the repo contract is
Node 24.x, npm 11.12.1, and CI uses `npm ci`. That mismatch sends humans and agents into an
unsupported runtime before they run meaningful checks, and `npm install` can churn the lockfile
unnecessarily.

## Current state

Current excerpts:

```md
<!-- README.md:91 -->
### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)
```

```md
<!-- README.md:105 -->
2. Install dependencies:

   ```bash
   npm install
   ```
```

```json
// package.json:5
"packageManager": "npm@11.12.1",

// package.json:9
"engines": {
	"node": "24.x",
	"npm": "11.12.1"
}
```

```text
# .nvmrc:1
24
```

```yaml
# .github/workflows/ci.yml:22
- run: npm install -g npm@11.12.1
- run: npm ci
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| README checks | `node -e "const text=require('fs').readFileSync('README.md','utf8'); const setup=text.split('## Available Scripts')[0]; if (/Node\\.js 18/.test(setup)) process.exit(1); if (/npm install(?! -g npm@11\\.12\\.1)/.test(setup)) process.exit(1);"` | no stale setup matches |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `README.md`
- `plans/README.md` status row only

**Out of scope**:

- Do not edit `package.json`, `package-lock.json`, `.nvmrc`, or CI workflow behavior.
- Do not install dependencies as part of this docs-only change unless the local checkout is missing
  `node_modules` and you need them for verification.
- Do not change environment variable setup; plan 026 already added `.env.example`.

## Git workflow

- Branch: `codex/058-align-readme-runtime-setup`
- Commit style: short imperative subject. Suggested: `Align README runtime setup`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Update prerequisites

In README "Getting Started" prerequisites, replace `Node.js 18+` with the actual runtime contract.

Suggested copy:

```md
- Node.js 24.x (use `.nvmrc` with `nvm use` if you use nvm)
- npm 11.12.1 (`npm install -g npm@11.12.1` if your Node install ships a different npm)
```

Keep the Supabase CLI prerequisite.

**Verify**:

```bash
rg -n "Node\\.js 18" README.md
```

returns no matches.

### Step 2: Update install command

Change setup step 2 to use `npm ci` instead of `npm install`.

If you mention `npm install`, make it clear it is not the normal clean-checkout setup command.
Prefer not mentioning it here.

**Verify**:

```bash
rg -n "npm ci" README.md
node -e "const text=require('fs').readFileSync('README.md','utf8'); const setup=text.split('## Available Scripts')[0]; if (/npm install(?! -g npm@11\\.12\\.1)/.test(setup)) process.exit(1);"
```

The first command shows the install step; the second command has no stale setup-step match while
allowing the prerequisite npm-version note.

### Step 3: Run the docs-safe gate

Run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

No product code changes. Verification is README search plus the standard repo gate.

## Done criteria

- [ ] README prerequisites name Node 24.x and npm 11.12.1.
- [ ] README install step uses `npm ci`.
- [ ] `package.json`, `package-lock.json`, `.nvmrc`, and CI workflows are unchanged.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 058 is updated.

## STOP conditions

Stop and report back if:

- `package.json`, `.nvmrc`, and CI no longer agree on the runtime version.
- Updating README requires changing package manager behavior.
- Verification would require dependency installation that mutates `package-lock.json`.

## Maintenance notes

When the runtime or package-manager contract changes, update `.nvmrc`, `package.json`, CI, and
README in the same PR so setup instructions do not drift again.

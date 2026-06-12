# Plan 024: Sanitize unhandled route error logs in the HTTP adapter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79cfef20..HEAD -- src/lib/server/adapters/httpAdapter.ts src/lib/server/logSanitize.ts src/lib/server/logSanitize.test.ts`
> If `httpAdapter.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (The `logSanitize` files do not
> exist yet — you create them.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `79cfef20`, 2026-06-11

## Why this matters

This is a military personnel management app: error payloads routinely carry personnel names,
emails, and phone numbers (Supabase/Postgres errors embed the failing row values in `details`;
use-case errors interpolate record fields into messages). The repo already treats this seriously —
`src/lib/server/auditLog.ts` has a comprehensive `sanitizeDetails()` that masks emails and
personnel names before anything reaches the audit table. But the **unhandled-error funnel
bypasses all of it**: every route error that isn't a recognized HTTP error lands at
`httpAdapter.ts:281`, where the raw error object is dumped to `console.error`. On Vercel, console
output goes to platform log drains — retained, searchable, and outside the access controls the
audit system was built to respect. After this plan, the funnel logs a bounded, masked diagnostic
summary (error name, masked message, top stack frames) instead of the raw object, and the masking
logic lives in one tested helper.

## Current state

- `src/lib/server/adapters/httpAdapter.ts` — the single funnel for route errors. `rethrowOrWrap`
  re-throws recognized HTTP errors/redirects and wraps everything else:

```ts
// src/lib/server/adapters/httpAdapter.ts:269-283 (as of 79cfef20)
if (isHttpError(err) || isRedirect(err)) {
	throw err;
}

if (err && typeof err === 'object' && 'status' in err) {
	const { status } = err as { status?: unknown };
	if (typeof status === 'number' && status >= 400 && status <= 599) {
		const message = err instanceof Error ? err.message : 'Request failed';
		throw error(status, message);
	}
}
console.error('[http-adapter] Unhandled route error:', err);
throw error(500, 'Internal server error');
```

This is the ONLY `console.error` in the file
(`grep -n "console.error" src/lib/server/adapters/httpAdapter.ts` → one match at line 281).

- `src/lib/server/auditLog.ts` — the existing PII-masking exemplar (`sanitizeDetails`,
  `maskEmail`, `isEmailKey` around lines 109–183). Those helpers are module-private and shaped
  around audit-event key/value pairs, not arbitrary thrown values — do not refactor auditLog to
  export them; build a small standalone helper instead (keeps this plan's blast radius to one
  call site).

- Server-side shared helpers live flat in `src/lib/server/` (e.g. `validation.ts`,
  `auditLog.ts`, `cronEndpointAuth.ts`), each with a colocated `*.test.ts`. Follow that
  convention: create `src/lib/server/logSanitize.ts` + `src/lib/server/logSanitize.test.ts`.
  (`src/lib/server/utils/` holds only feature timing helpers — wrong home for this.)

- Tests are vitest; a clean structural exemplar for a pure-function helper test is
  `src/lib/server/validation.test.ts`.

## Commands you will need

| Purpose       | Command                                             | Expected on success |
| ------------- | --------------------------------------------------- | ------------------- |
| Unit tests    | `npx vitest run src/lib/server/logSanitize.test.ts` | all pass            |
| Adapter tests | `npx vitest run src/lib/server/adapters`            | all pass            |
| Full tests    | `npm run test`                                      | exit 0              |
| Typecheck     | `npm run check`                                     | exit 0, 0 errors    |
| Lint          | `npm run lint`                                      | exit 0              |
| Format        | `npm run format`                                    | exit 0              |
| Governance    | `npm run governance:check`                          | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/lib/server/logSanitize.ts` (create)
- `src/lib/server/logSanitize.test.ts` (create)
- `src/lib/server/adapters/httpAdapter.ts` (the one `console.error` line only)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/server/auditLog.ts` — its sanitization serves the audit table and is already tested;
  duplicating one email regex is cheaper than entangling the two.
- Other `console.error` call sites across the server (`hooks.server.ts`, adapters, use cases) —
  most log fixed strings plus `error.message` from infrastructure errors. Sweeping them is a
  follow-up; this plan fixes the one funnel every unhandled route error passes through. List any
  call sites you notice logging whole error objects in your final report.
- The thrown response (`error(500, 'Internal server error')`) — clients already get a generic
  message; nothing to change there.

## Git workflow

- Branch: `advisor/024-sanitize-unhandled-route-error-logs`
- Commit style: short imperative subject (repo example: "Harden archive retention cron auth").
  Suggested: `Sanitize unhandled route error logs`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the sanitizer

Create `src/lib/server/logSanitize.ts` exporting one function:

```ts
/**
 * Produce a bounded, PII-masked diagnostic string for an unknown thrown value.
 * Never serializes arbitrary object graphs — only named diagnostic fields —
 * so row payloads inside Supabase/Postgres errors can't leak into logs.
 */
export function sanitizeErrorForLog(err: unknown): string;
```

Behavior (implement exactly):

1. **Field extraction, never full serialization.**
   - `err instanceof Error` → use `err.name`, `err.message`, and the first 5 lines of
     `err.stack` (when present).
   - Plain object → extract only string/number values of these keys if present: `name`,
     `message`, `code`, `details`, `hint` (the Supabase/Postgres error shape). Join as
     `key=value` pairs. Ignore every other key.
   - Anything else → `String(err)`.
   - Never call `JSON.stringify` on the input.
2. **Masking**, applied to every extracted string:
   - Emails: replace matches of `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g` with
     `[email]`.
   - Long digit runs (phone/SSN shaped): replace matches of `/\d{7,}/g` with `[number]`.
3. **Bounding**: truncate the final string to 1000 characters, appending `… [truncated]` when cut.

### Step 2: Use it at the funnel

In `src/lib/server/adapters/httpAdapter.ts`, change line 281 from:

```ts
console.error('[http-adapter] Unhandled route error:', err);
```

to:

```ts
console.error('[http-adapter] Unhandled route error:', sanitizeErrorForLog(err));
```

with the import added as `import { sanitizeErrorForLog } from '$lib/server/logSanitize';`
(match the file's existing `$lib/server/...` import style).

**Verify**: `npm run check` → exit 0; `npx vitest run src/lib/server/adapters` → all existing
adapter tests still pass.

### Step 3: Test the sanitizer

Create `src/lib/server/logSanitize.test.ts` (structure modeled on
`src/lib/server/validation.test.ts`) covering at least:

1. `Error` with an email in the message → output contains `[email]` and does not contain the
   email; contains the error name.
2. `Error` with a 10-digit phone number in the message → output contains `[number]`, not the
   digits.
3. Supabase-shaped plain object
   `{ message: 'duplicate key', code: '23505', details: 'Key (email)=(jane.doe@example.com) already exists.' }`
   → output includes `code=23505`, masks the email.
4. Object with a nested payload field NOT in the allowlist
   (e.g. `{ message: 'failed', record: { firstName: 'Jane', phone: '5551234567' } }`) → output
   contains neither `Jane` nor the phone digits (the field is ignored, not serialized).
5. A string input and a `null` input → returns a string, does not throw.
6. A message longer than 1000 chars → truncated with the `[truncated]` marker.

**Verify**: `npx vitest run src/lib/server/logSanitize.test.ts` → all (≥6) pass.

### Step 4: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.

## Test plan

Covered by Step 3 — the six cases above are the test plan. No adapter test changes expected: the
adapter's behavior (status codes, thrown errors) is unchanged; only the log line's argument
changed. If an existing adapter test asserts on the exact `console.error` arguments, update that
assertion to match the sanitized string — and say so in your report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "sanitizeErrorForLog(err)" src/lib/server/adapters/httpAdapter.ts` returns one match
- [ ] `grep -n "console.error" src/lib/server/adapters/httpAdapter.ts` returns exactly one match (line ~281)
- [ ] `npx vitest run src/lib/server/logSanitize.test.ts` exits 0 with ≥6 passing tests
- [ ] `npm run check`, `npm run lint`, `npm run test` all exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 024 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `httpAdapter.ts` no longer matches the "Current state" excerpt (more than one `console.error`,
  or the funnel moved).
- An existing test asserts the raw error object is logged AND the test's purpose is
  load-bearing beyond the log format (read the test before editing it; if unsure, stop).
- You feel the need to export helpers from `auditLog.ts` — that's out of scope; report why the
  standalone helper was insufficient instead.

## Maintenance notes

- Future server code should log unknown thrown values through `sanitizeErrorForLog`, not by
  passing the object to `console.error`. The known remaining raw-object log sites (e.g.
  `supabasePlatformUserDirectory.ts` logging auth admin errors) are a candidate follow-up sweep —
  deferred because each site needs a judgment call on what diagnostics it loses.
- Reviewer should scrutinize: the allowlist of extracted object keys (`name`, `message`, `code`,
  `details`, `hint`) — adding keys later is easy; starting wide is how payloads leak.
- The 5-stack-frame and 1000-char bounds are deliberate diagnosability/PII trade-offs; loosen
  them only with a reason written next to the constant.

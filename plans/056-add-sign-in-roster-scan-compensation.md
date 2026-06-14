# Plan 056: Add sign-in roster scan compensation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/org/[orgId]/api/sign-in-rosters/[id] src/lib/server/core/useCases src/lib/storage/sensitiveFiles.ts src/lib/storage/sensitiveFiles.test.ts src/lib/server/adapters/inMemory.ts src/routes/org/[orgId]/api/sign-in-rosters/[id]/server.test.ts src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

Signed sign-in roster scans are sensitive files. The upload endpoint writes storage before the DB
row points at the file, and delete paths remove storage before clearing or deleting the DB row. If a
DB operation fails after a storage mutation, the app can leave a roster pointing at a missing scan
or leave an uploaded scan orphaned without tests that define the intended compensation behavior.
This plan pins the safer contract: avoid broken DB references, compensate newly uploaded files on
DB failure, and prefer an orphaned file over a roster pointing at a missing file.

## Current state

- The upload route is route-local logic using `handle()` and `RouteConfig`.
- Existing tests cover policy wiring, spoofed PDF rejection, and happy-path upload.
- Personnel document and counseling record uploads already use a try/catch compensation pattern.

Current excerpts:

```ts
// src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts:53
await ctx.storage.upload(SENSITIVE_FILE_BUCKET, storagePath, input.file, { upsert: true });

await ctx.store.update('sign_in_rosters', ctx.auth.orgId, input.rosterId, {
	signed_file_path: storagePath
});
```

```ts
// src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts:86
if (roster.signed_file_path) {
	await ctx.storage.remove(SENSITIVE_FILE_BUCKET, [roster.signed_file_path]);
}

await ctx.store.update('sign_in_rosters', ctx.auth.orgId, input.rosterId, {
	signed_file_path: null
});
```

```ts
// src/routes/org/[orgId]/api/sign-in-rosters/[id]/+server.ts:23
if (roster.signed_file_path) {
	await ctx.storage.remove(SENSITIVE_FILE_BUCKET, [roster.signed_file_path]);
}

await ctx.store.delete('sign_in_rosters', ctx.auth.orgId, input.rosterId);
```

```ts
// src/lib/server/core/useCases/personnelDocuments.ts:170
} catch (error) {
	await ctx.storage.remove(PERSONNEL_DOCUMENTS_BUCKET, [filePath]);
	throw error;
}
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Targeted route tests | `npx vitest run 'src/routes/org/[orgId]/api/sign-in-rosters/[id]/server.test.ts' 'src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts'` | exits 0 |
| Sensitive file tests | `npx vitest run src/lib/storage/sensitiveFiles.test.ts` | exits 0 if touched |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/+server.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/server.test.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts`
- A small helper under `src/lib/server/core/useCases/` if it makes the compensation rules clearer.
- `src/lib/storage/sensitiveFiles.ts` only if unique scan path generation belongs there.
- `src/lib/server/adapters/inMemory.ts` only if tests need a tiny storage failure hook.
- `plans/README.md` status row only.

**Out of scope**:

- Do not change PDF signature validation; plan 011 already covered it.
- Do not change storage bucket names.
- Do not change sign-in roster creation/editing behavior.
- Do not add a migration.
- Do not touch production or remote storage.

## Git workflow

- Branch: `codex/056-add-sign-in-roster-scan-compensation`
- Commit style: short imperative subject. Suggested: `Add sign-in roster scan compensation`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make uploaded scan paths safe to compensate

The current storage path is deterministic from the original filename:

```ts
// src/lib/storage/sensitiveFiles.ts:20
return `${input.orgId}/${input.scope}/${input.recordId}/${sanitizeSensitiveFilename(input.filename)}`;
```

For sign-in roster scan uploads, generate a unique path segment, for example by prefixing the
sanitized filename with `crypto.randomUUID()`. This avoids overwriting an existing valid scan before
the DB update succeeds.

Keep the helper focused. If you add a new helper, name it around sign-in roster scans rather than
changing every sensitive file path in the repo.

**Verify**: a new or updated test proves two uploads with the same original filename produce
different storage paths.

### Step 2: Add upload compensation

Wrap the DB update after `ctx.storage.upload` in a try/catch. If the DB update fails, remove the
newly uploaded path and rethrow the original error. If that cleanup removal also fails, log the
cleanup failure as secondary and still rethrow the original DB update error. Match the personnel
document/counseling record compensation style.

Do not remove an existing previous scan path during upload in this plan unless you can prove the
new DB update succeeded and the previous path is different.

**Verify**: add a test where `ctx.store.update` fails after storage upload. Expected result:

- the request rejects,
- the newly uploaded file is removed,
- the roster row still points at its previous `signed_file_path` value.

### Step 3: Make scan unlink prefer DB truth over storage cleanup

For `DELETE /upload`, update the roster row to `signed_file_path: null` before removing the old
storage object. This avoids leaving a DB reference to a removed file if the DB update fails.

Add a test where `ctx.store.update` fails. Expected result:

- storage remove is not called before the DB update,
- the request rejects,
- the roster row still points at the old path,
- the old file still exists in test storage.

Then add the success-path test: DB path is cleared and old storage file is removed.

**Verify**:

```bash
npx vitest run 'src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/server.test.ts'
```

exits 0.

### Step 4: Make full roster deletion prefer DB truth over storage cleanup

For `DELETE /api/sign-in-rosters/[id]`, delete the roster row before removing the stored scan. This
can leave an orphaned file if storage cleanup fails, but it avoids the worse state where a live
roster points to a missing file.

Add tests covering:

- DB delete failure does not remove storage,
- successful DB delete removes storage,
- audit logging still happens only for successful deletion.

If storage remove fails after the DB delete succeeds, either let the request fail with the storage
error or log/report according to the local `handle()` pattern. Do not silently swallow storage
failure without a test that pins the chosen behavior.

**Verify**:

```bash
npx vitest run 'src/routes/org/[orgId]/api/sign-in-rosters/[id]/server.test.ts'
```

exits 0.

### Step 5: Run the full gate

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

- Upload DB failure compensation.
- Upload same-filename unique path behavior.
- Scan unlink DB failure does not remove storage first.
- Scan unlink success clears DB and removes storage.
- Full roster delete DB failure does not remove storage first.
- Full roster delete success deletes row, removes storage, and logs audit.

## Done criteria

- [ ] Sign-in roster scan uploads no longer overwrite a previous scan path before DB success.
- [ ] Upload DB failure removes the newly uploaded file.
- [ ] Scan unlink/delete DB failures do not remove storage first.
- [ ] New tests cover failure compensation and success paths.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 056 is updated.

## STOP conditions

Stop and report back if:

- Existing product behavior requires deterministic scan paths for external consumers.
- Changing deletion order conflicts with `handle()` transaction or audit assumptions.
- A compensation helper would require broad storage adapter changes outside the scoped files.
- Tests require touching remote storage or production data.

## Maintenance notes

For storage-backed DB references, prefer a tested compensation story. If a future feature chooses
storage-first writes, it should either generate non-clobbering paths and clean up on DB failure, or
explicitly document why orphaned files are acceptable.

# Plan 064: Move personnel export behind a use case

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts src/routes/org/[orgId]/api/personnel/[id]/export/server.test.ts src/lib/export/workbook/index.ts src/lib/export/workbook/workbook.test.ts src/lib/server/core/useCases/organizationDataExportManifest.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

The single-personnel export endpoint currently performs scoped authorization,
loads related read models, constructs Excel workbook sheets, generates the
filename, and writes audit details in one route config. That makes export
content shape and privacy scoping harder to test outside HTTP. Moving the
export body into a Personnel export use case leaves the route as a transport
adapter and gives future export changes one domain-owned home.

## Current state

- Route config declares `personnel.exportRecords` and parses `personnelId`.
- The route loads personnel, training records, counseling records,
  availability, labels, and extended info through `ctx.rawStore`.
- The route builds the workbook directly with `createWorkbook` and
  `addTableSheet`.
- The route writes audit action `personnel.exported` and returns a workbook
  response.
- Existing route tests load the workbook to assert sheet content and filename.

Current excerpts:

```ts
// src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts:21
export const _getConfig: RouteConfig<{ personnelId: string }, PersonnelExportOutput> = {
	policyAction: POLICY_ACTION_CATALOG.personnel.exportRecords,
```

```ts
// src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts:41
const [trainings, counseling, availability, trainingTypes, statusTypes, groups] = await Promise.all([
	ctx.rawStore.findMany<Record<string, unknown>>('personnel_trainings', orgId, { personnel_id: id }),
```

```ts
// src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts:77
const workbook = await createWorkbook();
```

```ts
// src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts:183
ctx.audit.log({
	action: 'personnel.exported',
```

```ts
// src/lib/server/core/useCases/organizationDataExportManifest.ts:40
export interface OrganizationDataExportReadableSheetDefinition {
	name: string;
	areaKey: OrganizationDataExportAreaKey;
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Export route tests | `npx vitest run src/routes/org/[orgId]/api/personnel/[id]/export/server.test.ts` | exits 0 |
| New export use-case tests | `npx vitest run src/lib/server/core/useCases/personnelExport.test.ts` | exits 0 |
| Workbook tests | `npx vitest run src/lib/export/workbook/workbook.test.ts` | exits 0 |
| Route workbook grep | `rg -n -e 'createWorkbook' -e 'addTableSheet' -e 'ctx\\.rawStore\\.findMany' -e 'personnel\\.exported' -e 'new Date\\(\\)\\.toISOString' src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts` | no matches |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts`
- `src/routes/org/[orgId]/api/personnel/[id]/export/server.test.ts`
- New `src/lib/server/core/useCases/personnelExport.ts`
- New `src/lib/server/core/useCases/personnelExport.test.ts`
- `src/lib/export/workbook/index.ts` only if a workbook helper is needed
- `src/lib/export/workbook/workbook.test.ts` only if a helper is added
- `plans/README.md` status row only

**Out of scope**:

- Do not change workbook sheet names, columns, filename format, or cell values.
- Do not change `organizationDataExportManifest.ts`; it is an exemplar only.
- Do not add streaming, background jobs, quotas, or migrations.
- Do not batch this with plan 063 Personnel lifecycle work.

## Git workflow

- Branch: `codex/064-move-personnel-export-behind-use-case`
- Commit style: short imperative subject. Suggested: `Move personnel export behind use case`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create a Personnel export use case

Create `src/lib/server/core/useCases/personnelExport.ts` that exports a function
such as `exportPersonnelWorkbook(ctx, input)`.

The use case should own:

- loading the personnel row,
- enforcing group-scoped feature policy with
  `POLICY_ACTION_CATALOG.personnel.exportRecords`,
- loading related record sets and label maps,
- building workbook sheets,
- generating the filename,
- writing `personnel.exported` audit details.

Return the same shape the route currently expects:

```ts
{ _buffer: ArrayBuffer; _filename: string }
```

The route may keep its coarse `policyAction`/`policyResource` metadata for the HTTP adapter, but
the use case owns the group-scoped export authorization after it has loaded the personnel row.

**Verify**:
`npx vitest run src/lib/server/core/useCases/personnelExport.test.ts` should
fail until tests and implementation are present, then pass.

### Step 2: Move route workbook behavior into use-case tests

Move or duplicate the route-level workbook assertions into
`personnelExport.test.ts`:

- policy denial happens before related record-set loads,
- Personnel Info sheet includes Rank, Duty Role, ETS, PCS / DEROS, archived
  timestamp, and extended info fields,
- Training Records sheet maps training type ids to names,
- Counseling Records sheet orders by `date_conducted` descending,
- Availability History maps status type ids to names,
- filename remains `<rank>_<last>_<first>-export-YYYY-MM-DD.xlsx`,
- audit action remains `personnel.exported`.

Model workbook parsing after
`src/routes/org/[orgId]/api/personnel/[id]/export/server.test.ts`.

**Verify**:
`npx vitest run src/lib/server/core/useCases/personnelExport.test.ts` exits 0.

### Step 3: Thin the export route

Update `src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts` so
`_getConfig.fn` delegates to the new use case. Keep `parseInput`, the coarse route
`policyAction`/`policyResource` metadata, and `formatOutput` in the route. Do not keep the
group-scoped personnel export policy decision in the route; that belongs in the use case after the
personnel row is loaded.

After this step the route should not build sheets, load related records, or
write audit details.

**Verify**:
`rg -n -e 'createWorkbook' -e 'addTableSheet' -e 'ctx\\.rawStore\\.findMany' -e 'personnel\\.exported' -e 'new Date\\(\\)\\.toISOString' src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts`
returns no matches.

### Step 4: Keep route tests focused on transport

Trim `server.test.ts` so it asserts:

- route config policy metadata,
- route delegates to the use case,
- `formatOutput` returns the expected workbook MIME type and attachment header.

The detailed workbook content assertions should live in the use-case test.

**Verify**:
`npx vitest run src/routes/org/[orgId]/api/personnel/[id]/export/server.test.ts src/lib/server/core/useCases/personnelExport.test.ts`
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

- New use-case tests own workbook content, scoping, and audit.
- Route tests own HTTP response formatting.
- Existing workbook helper tests remain green.
- Full repo gate.

## Done criteria

- [ ] Route no longer owns workbook construction or related record loading.
- [ ] Use-case tests cover the exported workbook content currently covered by
      route tests.
- [ ] Public export response headers and filenames are unchanged.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 064 is updated.

## STOP conditions

Stop and report back if:

- Moving workbook construction requires changing the shared workbook helper API.
- Existing route tests reveal clients depend on a hidden route-only side effect.
- Export content changes are needed to make the refactor pass.
- The change overlaps with plan 063 in the same worktree.

## Maintenance notes

Future Personnel export fields should be added to the use case and its workbook
tests, not directly to the route.

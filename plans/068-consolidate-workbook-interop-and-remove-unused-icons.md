# Plan 068: Consolidate workbook interop and remove unused icons

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/lib/export/workbook/index.ts src/lib/export/workbook/workbook.test.ts src/lib/utils/csvParser.ts src/lib/utils/csvParser.test.ts src/lib/components/ui/icons`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

Two small leftovers make the codebase noisier than it needs to be: ExcelJS
constructor interop is duplicated in export and import paths, and old handmade
icon wrappers remain even though active components import Lucide icons directly.
This plan removes low-risk duplication and dead UI files without changing user
behavior.

## Current state

- `createWorkbook()` dynamically imports ExcelJS and resolves the constructor.
- `parseXlsxBuffer()` in `csvParser.ts` repeats the same dynamic-import
  constructor resolution and error string.
- `PencilIcon.svelte`, `SettingsIcon.svelte`, and `Trash2Icon.svelte` exist
  under `src/lib/components/ui/icons`.
- Active consumers import Lucide directly, for example
  `@lucide/svelte/icons/pencil` and `@lucide/svelte/icons/trash-2`.

Current excerpts:

```ts
// src/lib/export/workbook/index.ts:23
export async function createWorkbook(): Promise<Workbook> {
	const ExcelJS = await import('exceljs');
	const WorkbookCtor =
```

```ts
// src/lib/utils/csvParser.ts:51
async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<string[][]> {
	const ExcelJS = await import('exceljs');
	const WorkbookCtor =
```

```svelte
<!-- src/lib/components/ui/icons/PencilIcon.svelte:1 -->
<script lang="ts">
	interface Props {
```

```svelte
<!-- src/lib/components/ui/icons/Trash2Icon.svelte:1 -->
<script lang="ts">
	interface Props {
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Workbook tests | `npx vitest run src/lib/export/workbook/workbook.test.ts src/lib/utils/csvParser.test.ts` | exits 0 |
| Icon import grep | `rg -n "\\$lib/components/ui/icons\|from ['\\\"]\\$lib/components/ui/icons" src` | no matches |
| ExcelJS duplication grep | `rg -n "ExcelJS Workbook constructor is unavailable\|default\\?\\.Workbook\|WorkbookCtor" src/lib/export/workbook/index.ts src/lib/utils/csvParser.ts src/lib/utils` | one shared helper path only |
| Svelte autofix, if any icon files are edited instead of deleted | `svelte-autofixer` | no issues or suggestions |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `src/lib/export/workbook/index.ts`
- `src/lib/export/workbook/workbook.test.ts`
- `src/lib/utils/csvParser.ts`
- `src/lib/utils/csvParser.test.ts`
- New small ExcelJS interop helper under `src/lib/utils/` or
  `src/lib/export/workbook/`
- `src/lib/components/ui/icons/PencilIcon.svelte`
- `src/lib/components/ui/icons/SettingsIcon.svelte`
- `src/lib/components/ui/icons/Trash2Icon.svelte`
- `plans/README.md` status row only

**Out of scope**:

- Do not change CSV/XLSX parsing behavior.
- Do not change workbook sheet formatting or response headers.
- Do not replace active Lucide imports.
- Do not touch unrelated icon components.

## Git workflow

- Branch: `codex/068-consolidate-workbook-interop-and-remove-unused-icons`
- Commit style: short imperative subject. Suggested: `Consolidate workbook interop cleanup`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract ExcelJS workbook constructor interop

Create one helper for resolving the ExcelJS workbook constructor from the
dynamic import shape. Keep it tiny and dependency-free.

Suggested shape:

```ts
type ExcelWorkbookConstructor<T> = new () => T;

export function resolveExcelWorkbookConstructor<T>(module: unknown): ExcelWorkbookConstructor<T> {
	const candidate = module as {
		Workbook?: ExcelWorkbookConstructor<T>;
		default?: { Workbook?: ExcelWorkbookConstructor<T> };
	};
	const WorkbookCtor = candidate.Workbook ?? candidate.default?.Workbook;
	if (!WorkbookCtor) throw new Error('ExcelJS Workbook constructor is unavailable');
	return WorkbookCtor;
}
```

Use it from both `createWorkbook()` and `parseXlsxBuffer()`. Avoid importing
server-only code into browser utilities.

**Verify**:
`npx vitest run src/lib/export/workbook/workbook.test.ts src/lib/utils/csvParser.test.ts`
exits 0.

### Step 2: Add focused helper coverage

Add a small test for the helper if it is exported from a testable module:

- resolves `{ Workbook }`,
- resolves `{ default: { Workbook } }`,
- throws the existing error message when unavailable.

If existing workbook/csv parser tests already cover both import shapes through
module mocks, keep the helper unexported and skip direct tests.

**Verify**:
`npx vitest run src/lib/export/workbook/workbook.test.ts src/lib/utils/csvParser.test.ts`
exits 0.

### Step 3: Delete unused handmade icon wrappers

Before deleting, run:

```bash
rg -n "\$lib/components/ui/icons|from ['\"]\$lib/components/ui/icons" src
```

If there are no imports, delete:

- `src/lib/components/ui/icons/PencilIcon.svelte`,
- `src/lib/components/ui/icons/SettingsIcon.svelte`,
- `src/lib/components/ui/icons/Trash2Icon.svelte`.

Do not change active Lucide imports such as
`@lucide/svelte/icons/pencil`.

**Verify**:
`rg -n "\$lib/components/ui/icons\|from ['\"]\$lib/components/ui/icons" src`
returns no matches.

### Step 4: Run the full gate

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

- Workbook helper tests and CSV parser tests remain green.
- Grep verifies no code imports deleted icon wrappers.
- Full repo gate.

## Done criteria

- [ ] ExcelJS constructor interop exists in one helper, not two copied blocks.
- [ ] CSV/XLSX parsing and workbook creation tests pass.
- [ ] Unused handmade icon wrapper files are deleted.
- [ ] No active code imports `$lib/components/ui/icons`.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 068 is updated.

## STOP conditions

Stop and report back if:

- `csvParser.ts` cannot import the shared helper without pulling server-only or
  export-only side effects into a browser path.
- Any active code imports the handmade icon wrappers.
- Tests reveal the duplicated ExcelJS interop blocks intentionally differ.
- Svelte autofixer reports an issue after icon deletion that requires changing
  active Svelte components.

## Maintenance notes

Prefer Lucide imports directly for common icons, matching current active
components. Keep ExcelJS import-shape handling in one helper so future bundler
changes have one place to update.

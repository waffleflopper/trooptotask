# Governance Checks

`npm run governance:check` enforces source boundaries and rejects new violations against the current baseline. Markdown filenames, headings and document inventories are not executable requirements; documentation review checks that current rules, remaining work and evidence stay discoverable.

It is intentionally narrow. It does not prove the architecture is clean. It helps catch new drift in the highest-risk seams we already know about. The [stabilization decisions](ARCHITECTURE.md#stabilization-decisions) require removal of existing exceptions through their owning tasks; passing this check alone does not establish a finished cutover.

## What It Checks Today

- route-level Supabase usage under `src/routes/` stays inside an explicit allowlist, including
  direct `locals.supabase` access and Supabase clients destructured or aliased from `locals`
- route-level admin-provider wiring under `src/routes/` stays inside a separate allowlist, including
  `getAdminClient()` calls, `ctx.adminClient` usage, `const { adminClient } = ctx` destructuring, and
  service-role Supabase adapter creation
- configured feature families are scanned for cross-feature permission-lane couplings by default, and known
  exceptions remain explicit in the JSON baseline
- every maintained `src` TS/JS/Svelte import is classified by one declared owner; private and undeclared cross-owner imports, source/owner cycles, and mixed-owner files are reported with Phase 08 owners
- each owner's `contracts.ts`, its only portable entrypoint, is checked transitively for Svelte, `$app`, browser globals, provider/Node imports, raw database-row types, UI and server code; web entrypoints are checked transitively for privileged imports (server-only files follow SvelteKit's `$lib/server` and `.server.` basename rules, plus route `+server` files), and feature `server/` files without SvelteKit-recognized placement are reported
- portable global references use TypeScript symbol resolution to distinguish ECMAScript bindings and existing neutral parsing/encoding APIs from DOM/platform dependencies; DTO member names, imported bindings and local shadowing remain valid
- portable `globalThis` access permits standard language globals and pure cross-runtime parsing/encoding utilities; unknown members and aliases fail closed, so new runtime facilities need an explicit rule review
- newly introduced findings and all findings assigned to completed Phase 07 scope fail the command; existing Phase 08 findings are counted by packet and remain visible through `node scripts/module-boundaries.ts`

## Baseline Classifications

Existing baseline entries use narrow classification labels to identify the route boundary they represent.
These labels are inventory, not permission to add exceptions:

- `auth-edge` means a route still performs provider-specific auth/session/invite work at the boundary.
- `cron-edge` means a scheduled maintenance route still builds service-role cleanup stores, storage adapters,
  or privileged RPC calls directly from the route.
- `platform-admin-edge` means a Platform Admin route still uses the admin context client or service-role
  adapters for platform/org/user support operations at the route boundary.

## What It Does Not Claim

- it does not prove a route is architecturally good just because it is allowlisted
- it does not prove a privileged route/provider seam is clean just because it is recorded
- it does not prove the authz model is correct
- it does not replace code review, ADRs or resolution of open product/design decisions
- it does not yet cover every shallow module or every terminology problem
- passing `governance:check` means no new boundary finding against the current default-branch comparison, not that the existing Phase 08 import graph is clean

## Phase 07 D02 boundary report and regression gate

`node scripts/module-boundaries.ts` prints every current finding and exits nonzero until the Phase 08 cutovers remove them. Its [owner declaration](../../scripts/module-boundaries.json) assigns each current source file, declares target dependency direction and public paths, and records mixed-owner files as findings. Type and value imports both participate in the source graph. A type-only server import is therefore a target-boundary finding even when SvelteKit erases it before building browser JavaScript. The standalone report is migration evidence, not a passing global-clean gate.

Vite root-relative imports such as `/src/features/personnel/index.ts` are local graph edges subject to the same ownership and privilege rules as aliases and relative imports. `import.meta.glob` is unsupported and fails explicitly in scripts and Svelte markup; use explicit imports. No current source consumer requires glob expansion.

Value imports follow the installed Vite runtime resolution order for explicit files and extensionless/index barrels, including existing JavaScript files ahead of TypeScript fallbacks. Directory imports with a local `package.json` are unsupported and fail explicitly; use an explicit file import rather than guessing the package entry. Erased type-only imports follow TypeScript resolution; when a value import has a distinct type target, both edges participate in boundary checks. Declaration files cannot stand in for missing executable files. Inline `import { type T }` retains its runtime side-effect edge under the application's `verbatimModuleSyntax` setting. Source symlinks (including directory and `src` root links) are unsupported and fail explicitly before traversal; they cannot silently terminate a transitive path. No current source consumer requires local package-entry or symlink support.

The canonical command compares that full current report with the same rules run on fetched `origin/main`; on current `main`, it compares with `HEAD^`. It refuses a branch behind `origin/main`, so removed debt cannot return unnoticed through an old merge-base. It reads the comparison commit's `src` tree locally and fails if a finding is newly present or the commit cannot be read. Depot CI's validation job fetches the required history and runs the production build with synthetic, unreachable provider settings; the build independently exercises SvelteKit's server-only import guard. No findings are excluded from the standalone report, and no hand-maintained exception list or count budget is used. Refresh `origin/main` before local checks and review any change to the owner declaration as a policy change. See the [D02 evidence](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/EVIDENCE.md#task-07-02b-ownership-and-public-dependency-rule) for the earlier standalone counts.

External packages are classified at the import boundary; the checker does not crawl `node_modules`. Portable contracts may reach only packages declared in `package.json` `dependencies`: test and build tooling in `devDependencies` (including `svelte`, `vite`, `vitest`, `jsdom`, `happy-dom` and `@testing-library/*`) and undeclared transitive packages are rejected. Among runtime dependencies, portable contracts also reject the current web inventory, including subpaths: the Svelte packages `svelte-sonner`, `@lucide/svelte`, `bits-ui`, `layerchart` and `mode-watcher`; the stylesheet packages `@fontsource/*` and `tw-animate-css`; the Tailwind build packages `tailwindcss` and `@tailwindcss/*`; and the browser file-generation packages `exceljs`, `jspdf` and `jspdf-autotable`. They also reject the framework/provider scopes above, local `.svelte`, `.svelte.ts` and `.svelte.js` modules, local files other than script modules and JSON (such as stylesheets, SVG, HTML or Markdown assets), and external stylesheet paths matching the checker's `STYLESHEET` pattern, including query suffixes. Web consumers can still use these packages and stylesheets. Neutral runtime packages such as `zod`, `clsx` and `@internationalized/date`, and local JSON data, remain valid in portable contracts. Universal `src/hooks.ts` and `src/params/*` matchers are web entries for the server-privilege rule. Runtime dependency additions require review of the web inventory; this is not a proof of portability for arbitrary npm packages.

## Baseline File

The allowlist lives in `docs/architecture/GOVERNANCE_BASELINE.json`.

Treat that file as a temporary truth table for tolerated exceptions:

- if you remove a documented exception, remove or update the baseline entry in the same slice
- do not add exceptions, allowlists or permission couplings to accommodate new drift
- record newly discovered debt as bounded work in [TODO](../stabilization/TODO.md), not as a passing-gate exemption
- preserve guards, assertions, scan paths and budgets; do not weaken checks, skip tests or hide consumers to obtain green results

For feature permission couplings, `featurePermissionCouplings` is an exception list, not the list of feature
families to scan. The checker scans configured feature families even when this array is empty. Remove resolved
entries and retain the scan; documenting a finding does not authorize a new permission coupling.

## Current-State Truth Versus Guardrail

- Current-state truth:
  - v1 still has documented route-level provider leaks and privileged route/provider seams. The six current feature lanes are distinct and `featurePermissionCouplings` is empty; the checker detects configured foreign-lane couplings in the Critical Tasks and Rating Scheme families only (`FEATURE_PERMISSION_FAMILIES` in `scripts/check-governance.mjs`). It does not scan every feature for permission borrowing or prove policy correctness. Personnel's rank-catalog Training-view read is an intentional cross-owner read documented in the [ownership ledger](CURRENT_OWNERSHIP.md#persisted-and-operational-ownership-07-01b), not evidence of complete scanner coverage.
  - cross-owner deep imports, central feature use cases and feature `server/*.ts` placement remain mapped migration work. The D02 checker reports these and web-to-privileged type import chains; its regression gate does not assert that the [chosen module and delivery contract](adrs/0013-v1-module-and-delivery-contract.md) is implemented across Phase 08 scope.
- Intended guardrail:
  - no new leaks, privileged route/provider exceptions or permission borrowing should land; D02 adds executable import/dependency checks without weakening these current guards
- Queued remediation:
  - finish provider and module cutovers through the stabilization queue, deleting replaced implementations and consumers in each owning task; documentation or a baseline entry cannot substitute for removal evidence

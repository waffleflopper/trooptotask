# Governance Checks

`npm run governance:check` enforces source boundaries and fails on any module-boundary finding. Markdown filenames, headings and document inventories are not executable requirements; documentation review checks that current rules, remaining work and evidence stay discoverable.

It is intentionally narrow. It does not prove the architecture is clean. It catches drift in the highest-risk seams we already know about. The [stabilization decisions](ARCHITECTURE.md#stabilization-decisions) require removal of existing exceptions through their owning tasks; passing this check alone does not establish a finished cutover.

## What It Checks Today

- route server files under `src/routes/` use no Supabase client directly, including `locals.supabase` access and
  clients destructured or aliased from `locals`; routes pass the request to an owned operation instead
- route server files acquire no admin provider, including `getAdminClient()` calls, `ctx.adminClient` usage,
  `const { adminClient } = ctx` destructuring and service-role Supabase adapter creation; Delivery adapters bind
  service-role ports after authorization
- configured feature families are scanned for cross-feature permission-lane couplings; any coupling fails
- every maintained `src` TS/JS/Svelte import is classified by one declared owner; private and undeclared cross-owner imports, source/owner cycles, and mixed-owner files are findings
- each owner's `contracts.ts`, its only portable entrypoint, is checked transitively for Svelte, `$app`, browser globals, provider/Node imports, raw database-row types, UI and server code; web entrypoints are checked transitively for privileged imports (server-only files follow SvelteKit's `$lib/server` and `.server.` basename rules, plus route `+server` files), and feature `server/` files without SvelteKit-recognized placement are reported
- portable global references use TypeScript symbol resolution to distinguish ECMAScript bindings and existing neutral parsing/encoding APIs from DOM/platform dependencies; DTO member names, imported bindings and local shadowing remain valid
- portable `globalThis` access permits standard language globals and pure cross-runtime parsing/encoding utilities; unknown members and aliases fail closed, so new runtime facilities need an explicit rule review
- the [UI foundation guard](#ui-foundation-guard) keeps one primitive foundation in `components/ui` and its families behind their public entries
- every module-boundary finding fails the command; `node scripts/module-boundaries.ts` prints the same full report

## What It Does Not Claim

- it does not prove that an owned operation receiving the request's client uses it correctly
- it does not prove the authz model is correct
- it does not replace code review, ADRs or resolution of open product/design decisions
- it does not yet cover every shallow module or every terminology problem
- passing `governance:check` means the declared ownership graph has no finding; it does not prove the declarations themselves are the right product boundaries

## Module boundary report and gate

`node scripts/module-boundaries.ts` prints every current finding and exits nonzero when any exists. Its [owner declaration](../../scripts/module-boundaries.json) assigns each current source file, declares target dependency direction and public paths, and records mixed-owner files as findings. Type and value imports both participate in the source graph. A type-only server import is therefore a target-boundary finding even when SvelteKit erases it before building browser JavaScript. Phase 08 removed every finding, so the report and the canonical command now agree.

Vite root-relative imports such as `/src/features/personnel/index.ts` are local graph edges subject to the same ownership and privilege rules as aliases and relative imports. `import.meta.glob` is unsupported and fails explicitly in scripts and Svelte markup; use explicit imports. No current source consumer requires glob expansion.

Value imports follow the installed Vite runtime resolution order for explicit files and extensionless/index barrels, including existing JavaScript files ahead of TypeScript fallbacks. Directory imports with a local `package.json` are unsupported and fail explicitly; use an explicit file import rather than guessing the package entry. Erased type-only imports follow TypeScript resolution; when a value import has a distinct type target, both edges participate in boundary checks. Declaration files cannot stand in for missing executable files. Inline `import { type T }` retains its runtime side-effect edge under the application's `verbatimModuleSyntax` setting. Source symlinks (including directory and `src` root links) are unsupported and fail explicitly before traversal; they cannot silently terminate a transitive path. No current source consumer requires local package-entry or symlink support.

The canonical command runs the same rules over the current tree and fails on any finding or unreadable source; it no longer compares with `origin/main`. GitHub Actions' validation job runs it and the production build with synthetic, unreachable provider settings; the build independently exercises SvelteKit's server-only import guard. No findings are excluded, and no hand-maintained exception list or count budget is used. Review any change to the owner declaration as a policy change. See the [D02 evidence](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/EVIDENCE.md#task-07-02b-ownership-and-public-dependency-rule) for the earlier standalone counts and the [D30 receipt](https://github.com/waffleflopper/trooptotask/blob/5fa75cf772d5a929408e97443b9cb005b4a71023/docs/stabilization/phase-08/d30-integrated-convergence.md) for the final Phase 08 removal.

External packages are classified at the import boundary; the checker does not crawl `node_modules`. Portable contracts may reach only packages declared in `package.json` `dependencies`: test and build tooling in `devDependencies` (including `svelte`, `vite`, `vitest`, `jsdom`, `happy-dom` and `@testing-library/*`) and undeclared transitive packages are rejected. Among runtime dependencies, portable contracts also reject the current web inventory, including subpaths: the Svelte packages `svelte-sonner`, `@lucide/svelte`, `bits-ui` and `layerchart`; the stylesheet packages `@fontsource/*` and `tw-animate-css`; the Tailwind build packages `tailwindcss` and `@tailwindcss/*`; and the browser file-generation packages `exceljs`, `jspdf` and `jspdf-autotable`. They also reject the framework/provider scopes above, local `.svelte`, `.svelte.ts` and `.svelte.js` modules, local files other than script modules and JSON (such as stylesheets, SVG, HTML or Markdown assets), and external stylesheet paths matching the checker's `STYLESHEET` pattern, including query suffixes. Web consumers can still use these packages and stylesheets. Neutral runtime packages such as `zod`, `clsx` and `@internationalized/date`, and local JSON data, remain valid in portable contracts. Universal `src/hooks.ts` and `src/params/*` matchers are web entries for the server-privilege rule. Runtime dependency additions require review of the web inventory; this is not a proof of portability for arbitrary npm packages.

## UI foundation guard

`scripts/ui-foundation.ts` runs inside the module-boundary checker over the same Svelte-aware import graph, so every rule fails `governance:check` and appears in `node scripts/module-boundaries.ts`. It reports these findings:

- `foundation-package`: `bits-ui`, including subpaths, is imported outside `src/lib/components/ui/`. Features and patterns compose a `ui` family instead.
- `foundation-private`: a file outside a `ui` or `patterns` family imports one of that family's files other than its `index.ts`. This applies to other `ui` families too; the family's own files may import each other.
- `foundation-layer`: a `ui` or `patterns` file imports feature, route, server-only, `src/lib/server`, `src/lib/storage` or `src/lib/access` code, or `$env/*`, `$app/server` or a `node:` builtin.
- `foundation-provider-type`: a `ui` or `patterns` file imports from `@supabase/*` (including `import('@supabase/…')` types) or references SvelteKit's ambient `App` namespace, which carries the provider session and user. Shared controls take caller-shaped props.
- `foundation-placement`: a directory under `src/lib/components/` other than `ui`, `patterns` or `public`. A new primitive family belongs in `ui` and a shared composition in `patterns`.

`scripts/ui-foundation.test.ts` exercises accepted and rejected Svelte and TypeScript fixtures for each rule through `checkModuleBoundaries`.

The rerunnable [Phase 10 consumer inventory](../stabilization/phase-10-inventory.md) (`npm run inventory:ui`) is a migration report, not a gate. It lists every tracked `.svelte` file and every `ui`/`patterns` importer with its packet, family imports, raw controls, `<style>` blocks, `var(--…)` references and hex literals. `npm run inventory:ui -- --check` reports a stale copy.

## No exception file

D30 removed the last route provider and module-boundary exceptions together with `GOVERNANCE_BASELINE.json`. Every check above fails on any occurrence:

- do not add exceptions, allowlists, permission couplings or manifest declarations to accommodate new drift
- record newly discovered debt as bounded work in [TODO](../stabilization/TODO.md), not as a passing-gate exemption
- preserve guards, assertions, scan paths and budgets; do not weaken checks, skip tests or hide consumers to obtain green results

## Current-State Truth Versus Guardrail

- Current-state truth:
  - no route server file uses a Supabase or admin provider client directly. The six current feature lanes are distinct; the checker detects configured foreign-lane couplings in the Critical Tasks and Rating Scheme families only (`FEATURE_PERMISSION_FAMILIES` in `scripts/check-governance.mjs`). It does not scan every feature for permission borrowing or prove policy correctness. Personnel's rank-catalog Training-view read is an intentional cross-owner read documented in the [ownership ledger](CURRENT_OWNERSHIP.md#persisted-and-operational-ownership-07-01b), not evidence of complete scanner coverage.
  - the D02 checker finds no cross-owner deep import, undeclared dependency, owner/source cycle, web-to-privileged import chain or misplaced feature `server/` file. That establishes the declared graph, not every semantic rule of the [chosen module and delivery contract](adrs/0013-v1-module-and-delivery-contract.md).
- Intended guardrail:
  - no new leaks, privileged route/provider exceptions, boundary findings or permission borrowing should land

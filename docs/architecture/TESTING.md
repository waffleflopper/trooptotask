# Testing Strategy

## Goal and scope

Detect consequential behavior and boundary regressions at the lowest stable seam that can prove them. Apply this policy when adding, rewriting, pruning or reviewing tests, including stabilization safety-net work.

Adapted from [v2's testing strategy](https://github.com/TroopToTask/trooptotask-v2/blob/b04e557d5f1d39585ab570f7b3c9c21a1f5c1a02/docs/architecture/TESTING.md). V1's [verification contract](DEFINITION_OF_DONE.md#verification-contract) owns commands, computer-use evidence and isolated database checks; its [stabilization decisions](ARCHITECTURE.md#stabilization-decisions) prohibit creating or running a repository E2E suite.

## Behavioral bar

A test must survive behavior-preserving refactors. Before adding or rewriting one, establish:

1. The exact behavior and its independent requirement: an approved contract, bug, accessibility rule or worked example.
2. The recognizable user-visible or caller-visible failure it detects.
3. An independently derived expected result and the public interface or stable seam under test.
4. Why this is the lowest-cost seam that can establish the behavior.
5. Nearby coverage and why the new test adds distinct protection.
6. A plausible internal refactor or intentional incidental copy/layout change the test would survive.

Expected results must be able to disagree with production code. Use known outcomes, independently specified rows or artifacts, and explicit boundary cases. Do not turn the current implementation into its own requirement. Show a failing regression or controlled fault where practical, then restore temporary faults before final validation.

## Prohibited test patterns

- **Tautologies:** copying a production calculation into the expectation, comparing a declaration against itself, deriving both actual and expected values from the same implementation, or asserting only that a stub returns its arranged value. Exercise the real behavior with fake dependencies instead of mocking the function under test.
- **Change detectors:** source scans for identifiers/imports/files, counts of wrappers/routes/exports, or assertions on private collaborator structure that fail only because implementation changed. A changed file or declaration is not evidence of a broken behavior.
- **Mock call trivia:** asserting incidental call counts, order or argument shapes without an independently required effect or boundary. Authorization denial, idempotency and provider isolation can require that an effect never occurs or occurs once; prove that outcome at the relevant port or stored-state boundary.
- **Appearance assertions:** dimensions, ratios, coordinates, computed layout, layout-specific classes, mounted-row counts or generic overflow measurements. Use manual visual evidence for appearance. A viewport may set context for a concrete interaction; viewport permutations alone do not justify duplicate tests.
- **Incidental copy assertions:** exact prose without an approved wording requirement, or repeating a selector's accessible name as a content assertion. Assert the meaningful state, reason code, navigation or retained data instead.
- **Structural or visual snapshots:** component-tree/markup/class snapshots, pixel comparisons or new visual-regression tooling. V1 has not adopted an automated visual-regression requirement; screenshots are review evidence.
- **False confidence:** duplicate behavior coverage solely for another fixture or incidental wording, sleeping instead of controlling time, reliance on test order, or fixtures built from real production data.
- **Test quotas:** new source scanners enforcing this document, test-count/assertion-count gates or coverage quotas. Review behavioral evidence; do not manufacture tests to satisfy a count.

Never weaken assertions, add skips, hide scan paths, add waivers or relax checks to make an unexpected failure pass. A build does not substitute for tests.

## Choose the seam

| Seam                  | What it must establish                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain                | Deterministic rules, state transitions, calculations, reason codes and normalization matrices using independently known results.                                                                                                           |
| Application and route | Real policy/use-case orchestration with in-memory ports: allowed/denied requests, observable mutations, retained identities, failure behavior, replay and idempotency as applicable. Fake persistence does not prove database enforcement. |
| Adapter and database  | Provider mapping and query semantics; constraints, functions, migration reproducibility, positive/negative RLS and Organization/Group isolation in the authorized disposable local stack.                                                  |
| Component             | Consequential interaction, accessibility semantics, keyboard operation and states only the rendered component can establish.                                                                                                               |
| Computer-use evidence | Affected retained journeys and visual review under the verification contract. No repository browser harness or application bypass.                                                                                                         |

Use roles, accessible names and labels to locate and operate controls. Keep focus and disabled-state assertions when that state is the interaction contract, such as first-invalid focus, restoring focus after a dialog closes or Save reflecting a semantic edit. Keep normalization permutations in domain tests and one representative component proof of the resulting control behavior.

Accessible names, stable error reasons, public responses, SQL constraints and approved import-security rules can be actual contracts. Preserve existing architecture/governance, authorization, secret-boundary and RLS controls. For a verifier, exercise accepted and rejected fixtures against the actual rule; parse configuration when its security meaning matters. Matching source or prose alone does not prove runtime enforcement. This policy does not authorize deleting approved verifiers or reducing their scan coverage.

## Review and pruning

Classify individual suspect tests as `DELETE`, `REWRITE` or `KEEP`; a file can contain all three. Recommend `DELETE` by default. A `KEEP` or `REWRITE` disposition requires written evidence for all six items in the behavioral bar. Without that justification, recommend deletion rather than preserving implementation trivia under a new name.

A review disposition is not edit authorization. Apply deletion or rewriting within the authorized cleanup scope. During stabilization, follow the owning [queue task](../stabilization/TODO.md): map consequential retained contracts to named executable protection before removing low-value assertions. Billing-only, Duty Roster-only and E2E tests retire with their owning tasks; mixed files keep retained coverage until its replacement exists.

When cleanup is authorized, remove unused fixtures, helpers, snapshots, imports and setup left by the deleted tests. A replacement should contain only the setup, action and assertions needed for the independently justified behavior. Do not change production behavior merely to satisfy a test. Report conflicting requirements or failed gates instead of adding a waiver.

## Completion

For the scoped test work, explain which behavior gained or retained protection, why nearby tests were insufficient, and how the test detects a real failure. Report audit dispositions when reviewing suspect tests; do not use passing counts as acceptance evidence by themselves. Run focused validation and the required [command sequence](DEFINITION_OF_DONE.md#required-commands), with database/computer-use checks when applicable. Record failed or unavailable evidence honestly.

# Billing Launch Go/No-Go Evidence Pack

Historical launch evidence only. Phase 03 removes billing; this document does not authorize a paid launch. Scheduled reconciliation and its backfill/report path are retired by D05 / 03-05a. Reconciliation columns and recorded preflight results below describe the former launch checklist, not executable current requirements. Current operator retirement ordering is in [RELEASE](stabilization/RELEASE.md). This commercial evidence document is owned for deletion by 03-07b.

## Purpose

This evidence pack records the billing launch rehearsal run on 2026-06-15 AKDT for the Plan 078 execution worktree. Its purpose is to collect support-safe proof for the paid-billing launch path without declaring live readiness before Robert-owned Stripe Dashboard and business confirmations are complete.

Verdict: **blocked**

Latest readiness gate:

- Command: `npm --silent run billing:launch-readiness -- --offline --json`
- Expected current result: `blocked`
- Reason: scenario evidence and Robert-owned confirmation artifacts remain incomplete.
- Confirmation record: `docs/billing-launch-confirmations.md` stores dates, owners, and artifact names only.

Blocked reasons:

- Full lifecycle scenarios were not executed end to end through owner and platform-admin UI surfaces during this run.
- Robert-owned launch confirmations remain open for test Dashboard state, live Dashboard state, final prices, live deployment variables, the final Stripe Tax decision, and the support owner/channel.
- Scenario rows below therefore record preflight and helper readiness, but they do not claim full launch readiness.

## Environment And Safety Rules

- Stripe mode: test mode only. Offline and online preflight both confirmed the configured Stripe secret mode is a test key.
- Database safety: no production database access was performed. No remote production systems were touched.
- Local database safety: no local database reset or table deletion was performed by this plan.
- Evidence safety: this document contains no secret values, provider signing headers, full payment details, or provider webhook bodies.
- Support-safe identifiers such as Stripe price, portal configuration, webhook endpoint, customer, subscription, and event IDs may be recorded when available.
- Readiness gate safety: `billing:launch-readiness` may report `go`, `blocked`, or `needs_confirmation` check statuses, but the launch remains blocked until the required scenario rows and Robert confirmation artifacts are present without storing secrets or production probing evidence.

## Preflight Evidence Summary

| Command                                                         | Result  | Pass | Warn | Fail | Follow-up owner | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ------- | ---: | ---: | ---: | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run billing:launch-preflight -- --offline --json`          | Passed  |   10 |    0 |    0 | Agent           | Confirmed required Stripe env names are present, billing is enabled locally, Stripe secret mode is test, webhook signing secret has the expected shape, automatic tax is disabled, and reconciliation authorization is present.                                                                                                                                                          |
| `npm --silent run billing:launch-readiness -- --offline --json` | Blocked |  n/a |  n/a |  n/a | Robert/Agent    | Readiness gate is available. It stays blocked while scenario evidence and Robert-owned confirmation artifacts are incomplete. Use the silent form when automation parses stdout as JSON.                                                                                                                                                                                                 |
| `npm run billing:launch-preflight -- --json`                    | Failed  |   26 |    1 |    2 | Robert          | Confirmed Team and Unit prices are active monthly test-mode USD prices, but the configured Stripe amounts are still Team $5.00 and Unit $12.00 instead of Team $4.99 and Unit $10.99. Customer Portal is active, invoice history/payment updates/customer info/cancellation are enabled, cancellation is at period end, and the configured webhook endpoint includes all handled events. |
| `npm run billing:lifecycle -- help`                             | Passed  |  n/a |  n/a |  n/a | Agent           | Helper listed create fixture, advance clock, switch plan, set payment mode, deliver events, cancel at period end, cancel now, and finish clock commands.                                                                                                                                                                                                                                 |

Online preflight warning:

- The configured test webhook endpoint also sends `customer.subscription.created`. This remains a launch decision to confirm as support-safe ignored noise, matching the existing runbook.

Online preflight failures:

- `STRIPE_TEAM_PRICE_ID` currently resolves to a test-mode monthly USD price at $5.00; update the configured Stripe test price to the Team $4.99 launch contract and rerun the preflight.
- `STRIPE_UNIT_PRICE_ID` currently resolves to a test-mode monthly USD price at $12.00; update the configured Stripe test price to the Unit $10.99 launch contract and rerun the preflight.

Support-safe Stripe identifiers observed during preflight:

| Item                          | Identifier                       |
| ----------------------------- | -------------------------------- |
| Team test price               | `price_1TaqcDHNzRUzX2eIENKgAPJh` |
| Unit test price               | `price_1TaqcDHNzRUzX2eImLzDzHwo` |
| Customer Portal configuration | `bpc_1T1FbFHNzRUzX2eIr52VJuUJ`   |
| Test webhook endpoint         | `we_1T1FSEHNzRUzX2eIPPSlgPcZ`    |

## Scenario Evidence

The former target surfaces were:

- Billing snapshot state.
- Webhook ledger state.
- Reconciliation result.
- Owner and platform-admin UI state.

| Scenario                            | Status  | Evidence captured                                                                                                        | Snapshot state | Webhook ledger state | Reconciliation result | Owner/admin UI state | Blocker or follow-up                                                                                       |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | -------------- | -------------------- | --------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Free-first checkout entry           | Blocked | Free-first launch posture documented.                                                                                    | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires owner entrypoint verification that self-service starts on Free before paid checkout.              |
| Billing-disabled fallback           | Blocked | Billing-disabled fallback documented.                                                                                    | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires local/test verification that checkout is unavailable when billing is disabled.                    |
| Checkout activation                 | Blocked | Preflight confirmed test-mode prices and webhook endpoint readiness.                                                     | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires a full owner checkout run against a local/test organization and UI evidence capture.              |
| Renewal success                     | Blocked | Lifecycle helper readiness confirmed.                                                                                    | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires test-clock fixture execution plus webhook delivery and UI/admin verification.                     |
| Failed renewal                      | Blocked | Lifecycle helper readiness confirmed.                                                                                    | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires a failing renewal run and recovery state verification.                                            |
| Portal period-end cancellation      | Blocked | Preflight confirmed Customer Portal cancellation is enabled and set to period end.                                       | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires portal cancellation through the owner path or an approved test-mode Dashboard/API equivalent.     |
| Immediate cancellation              | Blocked | Lifecycle helper readiness confirmed.                                                                                    | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires the confirmed Cancel Now path or test-mode helper execution plus webhook/UI verification.         |
| End-of-period terminal cancellation | Blocked | Lifecycle helper readiness confirmed.                                                                                    | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires period-end cancellation first, then clock advancement beyond paid-through.                        |
| Payment recovery and reactivation   | Blocked | Lifecycle helper readiness confirmed.                                                                                    | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires failed renewal setup, successful payment recovery, webhook processing, and UI/admin verification. |
| Plan change                         | Blocked | Preflight confirmed portal price changes are enabled, but product eligibility still needs Robert Dashboard confirmation. | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires Team/Unit product eligibility confirmation and a portal/API plan switch rehearsal.                |
| Unsupported event                   | Blocked | Preflight found optional `customer.subscription.created` delivery, matching the ignored-event runbook.                   | Not captured.  | Not captured.        | Not captured.         | Not captured.        | Requires sending or replaying an unsupported test event and confirming ignored ledger diagnostics.         |

## Robert-Owned Confirmations

| Confirmation                                 | Status                                      | Owner  | Notes                                                                                                                 |
| -------------------------------------------- | ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Test Stripe Dashboard mode and product setup | Requires Robert confirmation                | Robert | Preflight confirmed active test-mode prices, but visible Dashboard state and product eligibility remain Robert-owned. |
| Live Stripe Dashboard setup                  | Requires Robert confirmation                | Robert | Not inspected or modified by this plan.                                                                               |
| Final Team and Unit prices                   | Requires Robert/business-owner confirmation | Robert | Current test price IDs are evidence only, not final launch approval.                                                  |
| Live deployment variables                    | Requires Robert confirmation                | Robert | Not inspected or modified by this plan.                                                                               |
| Stripe Tax launch decision                   | Requires Robert confirmation                | Robert | Local/test env has automatic tax disabled; final launch decision remains Robert-owned.                                |
| Support owner/channel                        | Requires Robert/business-owner confirmation | Robert | Not confirmed during this plan.                                                                                       |

## Historical Go/No-Go Verdict

Verdict: **blocked**

Reasoning:

- Preflight and helper checks passed in test mode without exposing secret values.
- The evidence pack does not yet contain all four required surfaces for the scenario matrix.
- Robert-owned Dashboard, live-mode, tax, pricing, deployment-variable, and support confirmations remain open.
- Paid billing should not be enabled broadly until the scenario table is rerun with captured snapshot, webhook ledger, reconciliation, and owner/admin UI evidence for each launch scenario.

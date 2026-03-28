# Use Case Port Bundle Audit

Mechanically grepped every file in `src/lib/server/core/useCases/` for `ctx.store`, `ctx.auth`, `ctx.audit`, `ctx.readOnlyGuard`, `ctx.subscription`, `ctx.notifications`, `ctx.billing`, `ctx.storage`, `ctx.rawStore`.

## Per-File Results

| Use case file | Actual `ctx.*` ports used | Assigned type |
|---|---|---|
| `pinnedGroupCrud.ts` | store, auth, audit | `UserWritePorts` |
| `specialDayCrud.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `ratingSchemeEntryCrud.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `availabilityBatch.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `dailyAssignments.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `dailyAssignmentsBatch.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `deletionRequests.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `personnel.ts` | store, auth, audit, readOnlyGuard, subscription | `WriteWithSubscriptionPorts` |
| `personnelBatch.ts` | store, auth, audit, readOnlyGuard, subscription | `WriteWithSubscriptionPorts` |
| `trainingRecords.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `trainingRecordsBatch.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `onboardingLifecycle.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `onboardingResync.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `onboardingStepProgress.ts` | store, auth, audit, readOnlyGuard | `WritePorts` |
| `billing.ts` | auth, billing | `BillingPorts` |

## Divergences From Issue Predictions

Three files differed from the expected assignments in #404:

| File | Issue predicted | Audit found | Reason |
|---|---|---|---|
| `ratingSchemeEntryCrud.ts` | `WriteWithNotificationsPorts` | `WritePorts` | Uses `notifyAdminsViaStore(ctx.store, ...)` helper which takes `DataStore` directly, not `ctx.notifications` |
| `onboardingLifecycle.ts` | `WriteWithNotificationsPorts` | `WritePorts` | No `ctx.notifications` usage found |
| `billing.ts` | `Pick<UseCaseContext, 'store' \| 'auth' \| 'billing' \| 'subscription'>` | `BillingPorts` (`auth` + `billing` only) | No `ctx.store` or `ctx.subscription` usage found |

## Port Type Reference

- **`UserWritePorts`**: store, auth, audit
- **`WritePorts`**: store, auth, audit, readOnlyGuard
- **`WriteWithSubscriptionPorts`**: store, auth, audit, readOnlyGuard, subscription
- **`BillingPorts`**: auth, billing (new type defined in `billing.ts`)

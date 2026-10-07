# Retained entity mapping helpers

[`entitySchema.ts`](../src/lib/server/entitySchema.ts) supplies schema validation and row mapping for the remaining feature-owned entity definitions. Each definition lives with its owner; there is no shared entity barrel or generic repository factory. The last `entityHandlers` caller has moved to Critical Tasks operations, and the unused shared CRUD wrappers are removed.

New or migrated persistence uses the owning feature's typed server contract. Keep table names, provider queries and row mapping inside that owner. See [server conventions](architecture/MODULE_CONVENTIONS.md#server-conventions) and [provider boundaries](architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md).

## Mapping and validation

`defineEntity()` combines fields into create/update schemas and transforms. Existing owners may reuse these helpers while their persistence callers are cut over.

| Member                         | Purpose                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `createSchema`, `updateSchema` | Validate submitted fields; update also requires an ID           |
| `toDbInsert()`, `toDbUpdate()` | Map writable values to provider columns                         |
| `fromDb()`, `fromDbArray()`    | Map provider rows to domain values                              |
| `select`, `orderBy`, `table`   | Retained provider metadata; keep it inside owner implementation |

Retained metadata does not authorize a request or perform a mutation.

## Field options

| Option          | Behavior                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| `column`        | Overrides the default camelCase-to-snake_case column name                 |
| `readOnly`      | Excludes a field from submitted create/update values and writable mapping |
| `insertDefault` | Supplies an omitted insert value and makes the create field optional      |
| `nullDefault`   | Replaces a provider `null` during row mapping                             |
| `isPersonnelId` | Identifies the Personnel field for remaining entity metadata consumers    |

Input validation, policy decisions, persistence acknowledgment and audit effects belong to the owned operation. Group and Organization authority come from admitted request facts and the feature's policy contract.

## Delivery

[`httpAdapter.ts`](../src/lib/server/adapters/httpAdapter.ts) retains `handle()` and `loadWithContext()`. Delivery selects an operation-specific context after admission; routes declare the policy action and call the owner's operation. The [task library route](../src/routes/org/[orgId]/api/ict-tasks/+server.ts) shows explicit create/update delivery without a generic entity handler.

`handleUseCaseRequest(config, request, rawInput, selectContext)` is the pure request boundary for meaningful delivery tests. It enforces route authorization, validates any configured input, then selects the consumed context and invokes the operation. It does not supply a universal feature context or replace the owner's validation and policy checks.

For streamed loads, `defer: true` starts policy admission immediately and returns a `data` promise. Denied admission rejects that promise. See the [workspace conventions](architecture/MODULE_CONVENTIONS.md#route-handlers-and-loads) for the retained loading pattern.

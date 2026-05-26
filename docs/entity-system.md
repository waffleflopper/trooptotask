# Entity System (`src/lib/server/entities/`)

All database entities use the schema-first `defineEntity()` pattern. Each entity definition provides:
- **Type-safe transforms**: `.fromDb()` / `.fromDbArray()` (snake_case → camelCase)
- **Insert/update mapping**: `.toDbInsert()` / `.toDbUpdate()` (camelCase → snake_case)
- **Zod schemas**: `.createSchema` / `.updateSchema` for input validation
- **Metadata**: `.table`, `.groupScope`, `.methods`, `.fieldMap`, `.select`

> **Note**: `EntityDefinition` does **not** include a `.repo` or `.handlers` property.
> Use `entityHandlers()` from `httpAdapter` for standard CRUD routes, and `createRepository()` from `repositoryFactory` for data access.

---

## Defining a new entity

```typescript
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { MyType } from '$lib/types';

export const MyEntity = defineEntity<MyType>({
  table: 'my_table',
  groupScope: 'none', // or { personnelColumn: 'personnel_id' }
  policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
  audit: 'MyThing',
  orderBy: [{ column: 'sort_order', ascending: true }],
  schema: {
    id: field(z.string(), { readOnly: true }),
    name: field(z.string()),
    parentId: field(z.string(), { column: 'parent_id' }),
    note: field(z.string().nullable().optional(), { insertDefault: null })
  }
});
```

### EntityConfig options

| Option | Type | Description |
|---|---|---|
| `table` | `string` | Database table name |
| `groupScope` | `'none'` \| `{ personnelColumn: string }` | Group-scoped access control |
| `schema` | `Record<string, EntityField>` | Field definitions |
| `select` | `string` | Custom select expression (default `'*'`) |
| `orderBy` | `Array<{ column, ascending? }>` | Default sort order |
| `policyAction` | `FeatureLanePolicyAction` | Authorize mutations through a Policy Decision |
| `audit` | `string \| { resourceType, action?, detailFields? }` | Audit log config |
| `methods` | `EntityMethod[]` | HTTP verbs to allow; defaults to `['POST', 'PUT', 'DELETE']` |
| `customTransform` | `(row) => T` | Custom DB row → type mapping (for joins, etc.) |

---

## Field options

| Option | Description |
|---|---|
| `column` | DB column name if different from camelCase key (auto-converts if omitted) |
| `readOnly` | Excluded from create/update schemas and insert/update mapping |
| `insertDefault` | Default value when field is omitted on insert (makes field optional in `createSchema`) |
| `nullDefault` | Value to use in `fromDb` when DB value is `null` (e.g., `[]` for JSON arrays) |
| `isPersonnelId` | Marks the personnel ID field for group scope enforcement |

---

## Custom transforms

For entities with joins or complex mapping, use `customTransform`:

```typescript
export const PersonnelEntity = defineEntity<Personnel>({
  table: 'personnel',
  select: '*, groups(name)',
  customTransform: (row) => ({
    id: row.id as string,
    groupName: ((row.groups as Record<string, unknown>)?.name as string) ?? '',
    // ... other fields
  }),
  schema: { /* ... */ }
});
```

---

## Standard CRUD routes — `entityHandlers()`

For entities with standard POST/PUT/DELETE, use `entityHandlers()` from `httpAdapter`:

```typescript
// In +server.ts:
import { entityHandlers } from '$lib/server/adapters/httpAdapter';
import { MyEntity } from '$lib/server/entities/myEntity';

const handlers = entityHandlers(MyEntity, {
  policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
  beforeDelete: async (ctx, id) => { /* optional hook */ },
  afterDelete: async (ctx, id) => { /* optional hook */ }
});

export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
```

`entityHandlers()` automatically enforces:
- Policy Decision authorization (`policyAction`)
- Read-only guard on mutations
- Zod validation via `entity.createSchema` / `entity.updateSchema`
- Group scope enforcement
- Audit logging via `auditResource`

---

## Custom route handlers — `handle()`

For routes with non-standard logic, use `handle()`:

```typescript
import { handle } from '$lib/server/adapters/httpAdapter';
import { z } from 'zod';

export const POST = handle({
  policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
  policyResource: { kind: 'organization' },
  mutation: true,            // documents that this route changes state; read-only overlays follow policyAction.accessMode
  input: z.object({ name: z.string() }),  // optional Zod schema
  fn: async (ctx, input) => {
    // ctx is a fully-built UseCaseContext
    return { id: 'new-id' };
  },
  audit: {                   // optional declarative audit
    action: 'create',
    resourceType: 'MyThing',
    resourceId: (result) => result.id
  }
});
```

`handle()` enforces Policy Decision authorization, read-only overlays, and Zod validation automatically.

For custom input parsing (e.g. query params, form data), use `parseInput` instead of `input`:

```typescript
export const GET = handle({
  policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
  policyResource: { kind: 'organization' },
  parseInput: (event) => ({ id: event.params.id }),
  fn: async (ctx, input) => { /* ... */ }
});
```

For unit testing, use `handleUseCaseRequest(config, ctx, rawInput)` — the pure core without `RequestEvent`.

---

## Page loaders — `loadWithContext()`

For `+page.server.ts` and `+layout.server.ts` load functions:

```typescript
import { loadWithContext } from '$lib/server/adapters/httpAdapter';

export const load = async ({ locals, cookies, params }) => {
  return loadWithContext(locals, cookies, params.orgId, {
    policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
    policyResource: { kind: 'organization' },
    fn: async (ctx) => {
      return myUseCase(ctx);
    }
  });
};
```

For streaming with skeleton UIs, add `defer: true` — the policy check starts immediately, and denied access rejects the streamed data promise:

```typescript
return loadWithContext(locals, cookies, params.orgId, {
  policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
  policyResource: { kind: 'organization' },
  defer: true,
  fn: async (ctx) => fetchSlowData(ctx)
});
// Returns { data: Promise<T> } for SvelteKit streaming
```

For unit testing, use `loadWithContextCore(ctx, config)` — the pure core without SvelteKit dependency.

---

## Using entity transforms directly

For custom handlers that need direct mapping:

```typescript
import { MyEntity } from '$lib/server/entities/myEntity';

const insertData = MyEntity.toDbInsert(body, orgId);
const response = MyEntity.fromDb(data as Record<string, unknown>);
```

---

## Barrel export

All entities are available via `$lib/server/entities`:
```typescript
import { PersonnelEntity, TrainingTypeEntity } from '$lib/server/entities';
```

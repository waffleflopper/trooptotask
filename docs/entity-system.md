# Entity System (`src/lib/server/entities/`)

All database entities use the schema-first `defineEntity()` pattern. Each entity definition provides:
- **Type-safe transforms**: `.fromDb()` / `.fromDbArray()` (snake_case → camelCase)
- **Insert/update mapping**: `.toDbInsert()` / `.toDbUpdate()` (camelCase → snake_case)
- **Zod schemas**: `.createSchema` / `.updateSchema` for input validation
- **Repository**: `.repo` with `.list()`, `.query()`, `.queryDateRange()`, `.queryByIds()`
- **CRUD handlers**: `.handlers` with `.POST`, `.PUT`, `.DELETE` (for entities with standard CRUD)

## Defining a new entity

```typescript
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { MyType } from '$lib/types';

export const MyEntity = defineEntity<MyType>({
  table: 'my_table',
  groupScope: 'none', // or { personnelColumn: 'personnel_id' }
  orderBy: [{ column: 'sort_order', ascending: true }],
  schema: {
    id: field(z.string(), { readOnly: true }),
    name: field(z.string()),
    parentId: field(z.string(), { column: 'parent_id' }),
    note: field(z.string().nullable().optional(), { insertDefault: null })
  }
});
```

## Field options

- `column` — DB column name if different from camelCase key (auto-converts if omitted)
- `readOnly` — excluded from create/update schemas and insert/update mapping
- `insertDefault` — default value when field is omitted on insert (makes field optional in createSchema)
- `nullDefault` — value to use in `fromDb` when DB value is null (e.g., `[]` for JSON arrays)
- `isPersonnelId` — marks the personnel ID field for group scope enforcement

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

## Using entities in handlers

```typescript
// In custom apiRoute handlers:
import { MyEntity } from '$lib/server/entities/myEntity';

const insertData = MyEntity.toDbInsert(body, orgId);
const response = MyEntity.fromDb(data as Record<string, unknown>);
```

## For standard CRUD (no custom logic):

```typescript
// In +server.ts:
import { MyEntity } from '$lib/server/entities/myEntity';

export const POST = MyEntity.handlers.POST;
export const PUT = MyEntity.handlers.PUT;
export const DELETE = MyEntity.handlers.DELETE;
```

## Barrel export

All entities are available via `$lib/server/entities`:
```typescript
import { PersonnelEntity, TrainingTypeEntity } from '$lib/server/entities';
```

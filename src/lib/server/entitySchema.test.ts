import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { field, defineEntity } from './entitySchema';

describe('field()', () => {
	it('wraps a Zod type with metadata defaults', () => {
		const f = field(z.string());
		expect(f._zod).toBeDefined();
		expect(f._meta).toEqual({
			column: undefined,
			readOnly: false,
			insertDefault: undefined,
			isPersonnelId: false,
			nullDefault: undefined
		});
	});

	it('accepts explicit metadata overrides', () => {
		const f = field(z.string(), {
			column: 'full_name',
			readOnly: true,
			insertDefault: 'N/A',
			isPersonnelId: true,
			nullDefault: ''
		});
		expect(f._meta).toEqual({
			column: 'full_name',
			readOnly: true,
			insertDefault: 'N/A',
			isPersonnelId: true,
			nullDefault: ''
		});
	});
});

// Mock entity used across defineEntity tests
const mockSchema = {
	id: field(z.string(), { readOnly: true }),
	fullName: field(z.string(), { column: 'full_name' }),
	personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true }),
	isActive: field(z.boolean()),
	score: field(z.number().nullable(), { nullDefault: 0 }),
	notes: field(z.string(), { insertDefault: '' })
};

function createMockEntity() {
	return defineEntity({
		table: 'test_records',
		groupScope: { personnelColumn: 'personnel_id' },
		schema: mockSchema
	});
}

describe('defineEntity() fieldMap', () => {
	it('maps camelCase keys to snake_case columns', () => {
		const entity = createMockEntity();
		expect(entity.fieldMap.id).toBe('id');
		expect(entity.fieldMap.fullName).toBe('full_name');
		expect(entity.fieldMap.personnelId).toBe('personnel_id');
		expect(entity.fieldMap.isActive).toBe('is_active');
		expect(entity.fieldMap.score).toBe('score');
		expect(entity.fieldMap.notes).toBe('notes');
	});
});

describe('defineEntity() reverseMap', () => {
	it('maps snake_case columns back to camelCase keys', () => {
		const entity = createMockEntity();
		expect(entity.reverseMap.id).toBe('id');
		expect(entity.reverseMap.full_name).toBe('fullName');
		expect(entity.reverseMap.personnel_id).toBe('personnelId');
		expect(entity.reverseMap.is_active).toBe('isActive');
		expect(entity.reverseMap.score).toBe('score');
		expect(entity.reverseMap.notes).toBe('notes');
	});
});

describe('defineEntity() fromDb', () => {
	it('transforms a snake_case DB row to camelCase', () => {
		const entity = createMockEntity();
		const row = {
			id: 'abc-123',
			full_name: 'John Doe',
			personnel_id: 'p-1',
			is_active: true,
			score: 85,
			notes: 'good'
		};
		const result = entity.fromDb(row);
		expect(result).toEqual({
			id: 'abc-123',
			fullName: 'John Doe',
			personnelId: 'p-1',
			isActive: true,
			score: 85,
			notes: 'good'
		});
	});

	it('applies nullDefault when value is null', () => {
		const entity = createMockEntity();
		const row = {
			id: 'abc-123',
			full_name: 'Jane',
			personnel_id: 'p-2',
			is_active: false,
			score: null,
			notes: 'ok'
		};
		const result = entity.fromDb(row) as Record<string, unknown>;
		expect(result.score).toBe(0);
	});

	it('does not apply nullDefault when value is present', () => {
		const entity = createMockEntity();
		const row = {
			id: 'abc-123',
			full_name: 'Jane',
			personnel_id: 'p-2',
			is_active: false,
			score: 42,
			notes: 'ok'
		};
		const result = entity.fromDb(row) as Record<string, unknown>;
		expect(result.score).toBe(42);
	});
});

describe('defineEntity() fromDbArray', () => {
	it('transforms multiple DB rows', () => {
		const entity = createMockEntity();
		const rows = [
			{ id: '1', full_name: 'A', personnel_id: 'p-1', is_active: true, score: 10, notes: '' },
			{ id: '2', full_name: 'B', personnel_id: 'p-2', is_active: false, score: null, notes: 'x' }
		];
		const results = entity.fromDbArray(rows);
		expect(results).toHaveLength(2);
		expect((results[0] as Record<string, unknown>).fullName).toBe('A');
		expect((results[1] as Record<string, unknown>).fullName).toBe('B');
		expect((results[1] as Record<string, unknown>).score).toBe(0); // nullDefault
	});
});

describe('defineEntity() toDbInsert', () => {
	it('converts camelCase body to snake_case with organization_id', () => {
		const entity = createMockEntity();
		const body = { fullName: 'Alice', personnelId: 'p-1', isActive: true, score: 90 };
		const result = entity.toDbInsert(body, 'org-1');
		expect(result).toEqual({
			organization_id: 'org-1',
			full_name: 'Alice',
			personnel_id: 'p-1',
			is_active: true,
			score: 90,
			notes: '' // insertDefault applied
		});
	});

	it('skips id and readOnly fields', () => {
		const entity = createMockEntity();
		const body = { id: 'should-skip', fullName: 'Bob', personnelId: 'p-2', isActive: false };
		const result = entity.toDbInsert(body, 'org-1');
		expect(result.id).toBeUndefined();
		expect(result.full_name).toBe('Bob');
	});

	it('applies insertDefault when field is not provided', () => {
		const entity = createMockEntity();
		const body = { fullName: 'Charlie', personnelId: 'p-3', isActive: true, score: 50 };
		// notes not provided — should get insertDefault ''
		const result = entity.toDbInsert(body, 'org-1');
		expect(result.notes).toBe('');
	});
});

describe('defineEntity() toDbUpdate', () => {
	it('converts provided fields to snake_case, skips undefined', () => {
		const entity = createMockEntity();
		const body = { id: 'abc', fullName: 'Updated' };
		const result = entity.toDbUpdate(body);
		expect(result).toEqual({ full_name: 'Updated' });
		expect(result.id).toBeUndefined();
	});

	it('skips readOnly fields', () => {
		const entity = createMockEntity();
		// Even if someone passes id in the body, it should be skipped
		const body = { id: 'abc', isActive: false, score: 100 };
		const result = entity.toDbUpdate(body);
		expect(result).toEqual({ is_active: false, score: 100 });
	});
});

describe('defineEntity() personnelIdField', () => {
	it('auto-detects the field marked isPersonnelId', () => {
		const entity = createMockEntity();
		expect(entity.personnelIdField).toBe('personnelId');
	});

	it('returns null when no field is marked isPersonnelId', () => {
		const entity = defineEntity({
			table: 'simple',
			groupScope: 'none',
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string())
			}
		});
		expect(entity.personnelIdField).toBeNull();
	});
});

describe('defineEntity() createSchema', () => {
	it('excludes readOnly fields (id)', () => {
		const entity = createMockEntity();
		const shape = entity.createSchema.shape;
		expect(shape.id).toBeUndefined();
	});

	it('makes fields with insertDefault optional', () => {
		const entity = createMockEntity();
		// notes has insertDefault, so it should be optional
		const withNotes = entity.createSchema.safeParse({
			fullName: 'Test',
			personnelId: 'p-1',
			isActive: true,
			score: 10,
			notes: 'provided'
		});
		expect(withNotes.success).toBe(true);

		const withoutNotes = entity.createSchema.safeParse({
			fullName: 'Test',
			personnelId: 'p-1',
			isActive: true,
			score: 10
			// notes omitted — should still pass
		});
		expect(withoutNotes.success).toBe(true);
	});

	it('requires fields without insertDefault', () => {
		const entity = createMockEntity();
		const result = entity.createSchema.safeParse({
			// missing fullName — should fail
			personnelId: 'p-1',
			isActive: true,
			score: 10
		});
		expect(result.success).toBe(false);
	});
});

describe('defineEntity() updateSchema', () => {
	it('requires id', () => {
		const entity = createMockEntity();
		const result = entity.updateSchema.safeParse({ fullName: 'Updated' });
		expect(result.success).toBe(false);
	});

	it('makes all non-readOnly fields optional', () => {
		const entity = createMockEntity();
		const result = entity.updateSchema.safeParse({ id: 'abc-123' });
		expect(result.success).toBe(true);
	});

	it('accepts partial updates', () => {
		const entity = createMockEntity();
		const result = entity.updateSchema.safeParse({ id: 'abc-123', fullName: 'New Name' });
		expect(result.success).toBe(true);
	});

	it('excludes readOnly fields from shape (except id)', () => {
		// id is readOnly but still required in updateSchema
		const entity = createMockEntity();
		const shape = entity.updateSchema.shape;
		expect(shape.id).toBeDefined();
		// no other readOnly fields in mockSchema besides id
	});
});

describe('defineEntity() groupScope validation', () => {
	it('throws if groupScope.personnelColumn does not match isPersonnelId field column', () => {
		expect(() =>
			defineEntity({
				table: 'bad',
				groupScope: { personnelColumn: 'wrong_column' },
				schema: {
					id: field(z.string(), { readOnly: true }),
					personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true })
				}
			})
		).toThrow(/personnelColumn.*mismatch/i);
	});

	it('does not throw when groupScope.personnelColumn matches isPersonnelId field', () => {
		expect(() =>
			defineEntity({
				table: 'ok',
				groupScope: { personnelColumn: 'personnel_id' },
				schema: {
					id: field(z.string(), { readOnly: true }),
					personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true })
				}
			})
		).not.toThrow();
	});

	it('throws if groupScope has personnelColumn but no field is marked isPersonnelId', () => {
		expect(() =>
			defineEntity({
				table: 'bad',
				groupScope: { personnelColumn: 'personnel_id' },
				schema: {
					id: field(z.string(), { readOnly: true }),
					name: field(z.string())
				}
			})
		).toThrow(/isPersonnelId/i);
	});
});

describe('defineEntity() methods config', () => {
	it('defaults methods to POST, PUT, DELETE', () => {
		const entity = defineEntity({
			table: 'all_methods',
			groupScope: 'none',
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string())
			}
		});
		expect(entity.methods).toEqual(['POST', 'PUT', 'DELETE']);
	});

	it('exposes only specified methods when methods config is provided', () => {
		const entity = defineEntity({
			table: 'post_delete_only',
			groupScope: 'none',
			methods: ['POST', 'DELETE'],
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string())
			}
		});
		expect(entity.methods).toEqual(['POST', 'DELETE']);
	});
});

describe('defineEntity() metadata preservation', () => {
	it('preserves permission, requireFullEditor, audit, and orderBy when provided', () => {
		const entity = defineEntity({
			table: 'with_meta',
			groupScope: 'none',
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string())
			},
			permission: 'training',
			requireFullEditor: true,
			audit: 'training_type',
			orderBy: [{ column: 'name', ascending: true }]
		});
		expect(entity.permission).toBe('training');
		expect(entity.requireFullEditor).toBe(true);
		expect(entity.audit).toBe('training_type');
		expect(entity.orderBy).toEqual([{ column: 'name', ascending: true }]);
	});

	it('defaults metadata fields to undefined when not provided', () => {
		const entity = defineEntity({
			table: 'no_meta',
			groupScope: 'none',
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string())
			}
		});
		expect(entity.permission).toBeUndefined();
		expect(entity.requireFullEditor).toBeUndefined();
		expect(entity.audit).toBeUndefined();
		expect(entity.orderBy).toBeUndefined();
	});

	it('preserves complex audit config objects', () => {
		const auditConfig = { resourceType: 'training_type', action: 'custom_action', detailFields: ['name'] };
		const entity = defineEntity({
			table: 'complex_audit',
			groupScope: 'none',
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string())
			},
			audit: auditConfig
		});
		expect(entity.audit).toEqual(auditConfig);
	});
});

describe('defineEntity() customTransform', () => {
	it('overrides fromDb when provided', () => {
		const entity = defineEntity({
			table: 'custom',
			groupScope: 'none',
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string())
			},
			customTransform: (row) => ({
				identifier: row.id,
				displayName: String(row.name).toUpperCase()
			})
		});
		const result = entity.fromDb({ id: '1', name: 'alice' });
		expect(result).toEqual({ identifier: '1', displayName: 'ALICE' });
	});

	it('overrides fromDbArray when provided', () => {
		const entity = defineEntity({
			table: 'custom',
			groupScope: 'none',
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string())
			},
			customTransform: (row) => ({
				identifier: row.id,
				displayName: String(row.name).toUpperCase()
			})
		});
		const results = entity.fromDbArray([
			{ id: '1', name: 'alice' },
			{ id: '2', name: 'bob' }
		]);
		expect(results).toEqual([
			{ identifier: '1', displayName: 'ALICE' },
			{ identifier: '2', displayName: 'BOB' }
		]);
	});
});

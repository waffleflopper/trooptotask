import { describe, it, expect } from 'vitest';
import { StatusTypeEntity } from './statusType';
import type { StatusType } from '$lib/types';

describe('StatusTypeEntity', () => {
	it('fromDb produces correct StatusType shape (snake_case → camelCase)', () => {
		const row = { id: 'st-1', name: 'Leave', color: '#22c55e', text_color: '#ffffff' };
		const result = StatusTypeEntity.fromDb(row) as StatusType;

		expect(result).toEqual({
			id: 'st-1',
			name: 'Leave',
			color: '#22c55e',
			textColor: '#ffffff'
		});
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{ id: 'st-1', name: 'Leave', color: '#22c55e', text_color: '#ffffff' },
			{ id: 'st-2', name: 'TDY', color: '#3b82f6', text_color: '#000000' }
		];
		const results = StatusTypeEntity.fromDbArray(rows) as StatusType[];

		expect(results).toEqual([
			{ id: 'st-1', name: 'Leave', color: '#22c55e', textColor: '#ffffff' },
			{ id: 'st-2', name: 'TDY', color: '#3b82f6', textColor: '#000000' }
		]);
	});

	it('toDbInsert applies defaults and adds organization_id', () => {
		const result = StatusTypeEntity.toDbInsert({ name: 'Sick Call' }, 'org-1');

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'Sick Call',
			color: '#6b7280',
			text_color: '#ffffff',
			sort_order: 0
		});
	});

	it('toDbInsert allows explicit values to override defaults', () => {
		const result = StatusTypeEntity.toDbInsert(
			{ name: 'Leave', color: '#22c55e', textColor: '#000000', sortOrder: 5 },
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'Leave',
			color: '#22c55e',
			text_color: '#000000',
			sort_order: 5
		});
	});

	it('toDbUpdate maps camelCase to snake_case correctly', () => {
		const result = StatusTypeEntity.toDbUpdate({ id: 'st-1', textColor: '#000000', name: 'Updated' });

		expect(result).toEqual({
			text_color: '#000000',
			name: 'Updated'
		});
	});

	it('createSchema requires name, makes color/textColor/sortOrder optional', () => {
		const valid = StatusTypeEntity.createSchema.safeParse({ name: 'Leave' });
		expect(valid.success).toBe(true);

		const missing = StatusTypeEntity.createSchema.safeParse({});
		expect(missing.success).toBe(false);

		const withOptionals = StatusTypeEntity.createSchema.safeParse({
			name: 'TDY',
			color: '#3b82f6',
			textColor: '#000000',
			sortOrder: 2
		});
		expect(withOptionals.success).toBe(true);
	});

	it('has groupScope set to none', () => {
		expect(StatusTypeEntity.groupScope).toBe('none');
	});

	it('has table set to status_types', () => {
		expect(StatusTypeEntity.table).toBe('status_types');
	});

	it('has onDelete cascade config (function exists)', () => {
		// The entity config has onDelete for cascade deleting availability_entries
		// We verify this indirectly through the handlers being generated
		// Since onDelete is on the config (not exposed on EntityDefinition), we verify
		// the entity was created successfully with handlers
		expect(StatusTypeEntity.handlers).toBeDefined();
		expect(StatusTypeEntity.handlers.DELETE).toBeDefined();
	});

	it('has repo for data access', () => {
		expect(StatusTypeEntity.repo).toBeDefined();
		expect(typeof StatusTypeEntity.repo.list).toBe('function');
	});
});

import { describe, it, expect } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { queryPersonnel, countPersonnel, queryPersonnelRaw } from './personnelQuery';

const ORG = 'test-org';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>, rows: Record<string, unknown>[]) {
	ctx.store.seed(
		'personnel',
		rows.map((r) => ({ organization_id: ORG, archived_at: null, ...r }))
	);
}

describe('queryPersonnel', () => {
	it('returns active personnel sorted by last_name', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, [
			{ id: 'p1', last_name: 'Zulu', first_name: 'A', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null },
			{
				id: 'p2',
				last_name: 'Alpha',
				first_name: 'B',
				rank: 'CPT',
				clinic_role: 'provider',
				mos: '61H',
				group_id: null
			},
			{
				id: 'p3',
				last_name: 'Mid',
				first_name: 'C',
				rank: 'PFC',
				clinic_role: 'medic',
				mos: '68W',
				group_id: null,
				archived_at: '2025-01-01'
			}
		]);

		const result = await queryPersonnel(ctx);

		expect(result).toHaveLength(2);
		expect(result[0].lastName).toBe('Alpha');
		expect(result[1].lastName).toBe('Zulu');
	});

	it('returns only archived personnel when archived: true', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, [
			{ id: 'p1', last_name: 'Active', first_name: 'A', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null },
			{
				id: 'p2',
				last_name: 'Gone',
				first_name: 'B',
				rank: 'CPT',
				clinic_role: 'provider',
				mos: '61H',
				group_id: null,
				archived_at: '2025-06-01'
			}
		]);

		const result = await queryPersonnel(ctx, { archived: true });

		expect(result).toHaveLength(1);
		expect(result[0].lastName).toBe('Gone');
	});

	it('returns all personnel when archived: all', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, [
			{ id: 'p1', last_name: 'Active', first_name: 'A', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null },
			{
				id: 'p2',
				last_name: 'Gone',
				first_name: 'B',
				rank: 'CPT',
				clinic_role: 'provider',
				mos: '61H',
				group_id: null,
				archived_at: '2025-06-01'
			}
		]);

		const result = await queryPersonnel(ctx, { archived: 'all' });

		expect(result).toHaveLength(2);
	});
});

describe('countPersonnel', () => {
	it('returns count of active personnel without data', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, [
			{ id: 'p1', last_name: 'A', first_name: 'A', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null },
			{ id: 'p2', last_name: 'B', first_name: 'B', rank: 'CPT', clinic_role: 'provider', mos: '61H', group_id: null },
			{
				id: 'p3',
				last_name: 'C',
				first_name: 'C',
				rank: 'PFC',
				clinic_role: 'medic',
				mos: '68W',
				group_id: null,
				archived_at: '2025-01-01'
			}
		]);

		const count = await countPersonnel(ctx);

		expect(count).toBe(2);
	});
});

describe('queryPersonnel filters and pagination', () => {
	it('applies filters to narrow results', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, [
			{ id: 'p1', last_name: 'Smith', first_name: 'A', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null },
			{
				id: 'p2',
				last_name: 'Jones',
				first_name: 'B',
				rank: 'CPT',
				clinic_role: 'provider',
				mos: '61H',
				group_id: null
			}
		]);

		const result = await queryPersonnel(ctx, { filters: { rank: 'SGT' } });

		expect(result).toHaveLength(1);
		expect(result[0].lastName).toBe('Smith');
	});

	it('applies pagination via range', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, [
			{ id: 'p1', last_name: 'A', first_name: 'A', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null },
			{ id: 'p2', last_name: 'B', first_name: 'B', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null },
			{ id: 'p3', last_name: 'C', first_name: 'C', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null }
		]);

		const result = await queryPersonnel(ctx, { range: { from: 0, to: 0 } });

		expect(result).toHaveLength(1);
		expect(result[0].lastName).toBe('A');
	});

	it('applies custom orderBy', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, [
			{ id: 'p1', last_name: 'A', first_name: 'Z', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null },
			{ id: 'p2', last_name: 'B', first_name: 'A', rank: 'SGT', clinic_role: 'medic', mos: '68W', group_id: null }
		]);

		const result = await queryPersonnel(ctx, {
			orderBy: [{ column: 'first_name', ascending: true }]
		});

		expect(result[0].firstName).toBe('A');
		expect(result[1].firstName).toBe('Z');
	});
});

describe('queryPersonnelRaw', () => {
	it('returns untransformed rows', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, [
			{
				id: 'p1',
				last_name: 'Smith',
				first_name: 'John',
				rank: 'SGT',
				clinic_role: 'medic',
				mos: '68W',
				group_id: null
			}
		]);

		const result = await queryPersonnelRaw(ctx);

		expect(result).toHaveLength(1);
		expect(result[0].last_name).toBe('Smith');
		expect((result[0] as Record<string, unknown>).lastName).toBeUndefined();
	});
});

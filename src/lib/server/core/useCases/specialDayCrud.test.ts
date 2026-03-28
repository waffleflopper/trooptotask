import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { createCrudUseCases } from './crud';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { createResetFederalHolidaysUseCase } from './specialDayCrud';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

function createSpecialDayCrudUseCases() {
	return createCrudUseCases({
		entity: SpecialDayEntity,
		permission: 'calendar',
		auditResource: 'special_day'
	});
}

describe('SpecialDay CRUD use case', () => {
	it('creates a special day and audits', async () => {
		const ctx = buildContext();
		const { create } = createSpecialDayCrudUseCases();

		const result = (await create(ctx, {
			date: '2026-12-25',
			name: 'Christmas',
			type: 'org-closure'
		})) as { name: string; date: string };

		expect(result).toMatchObject({ name: 'Christmas', date: '2026-12-25' });
		expect(ctx.audit.events[0].action).toBe('special_day.created');
	});

	it('deletes a special day and audits', async () => {
		const ctx = buildContext();
		ctx.store.seed('special_days', [
			{
				id: 'sd-1',
				date: '2026-12-25',
				name: 'Christmas',
				type: 'org-closure',
				organization_id: 'test-org'
			}
		]);

		const { remove } = createSpecialDayCrudUseCases();
		await remove(ctx, 'sd-1');

		const stored = await ctx.store.findOne('special_days', 'test-org', { id: 'sd-1' });
		expect(stored).toBeNull();
		expect(ctx.audit.events[0].action).toBe('special_day.deleted');
	});
});

describe('resetFederalHolidays use case', () => {
	it('deletes existing federal holidays and inserts fresh defaults', async () => {
		const ctx = buildContext();
		// Seed existing federal holidays and an org-closure (should survive)
		ctx.store.seed('special_days', [
			{
				id: 'sd-old-1',
				date: '2025-01-01',
				name: 'Old New Year',
				type: 'federal-holiday',
				organization_id: 'test-org'
			},
			{
				id: 'sd-closure',
				date: '2026-06-15',
				name: 'Team Day',
				type: 'org-closure',
				organization_id: 'test-org'
			}
		]);

		const resetUseCase = createResetFederalHolidaysUseCase();
		const result = await resetUseCase(ctx);

		// Org-closure should survive
		const closures = (await ctx.store.findMany('special_days', 'test-org', {
			type: 'org-closure'
		})) as Array<Record<string, unknown>>;
		expect(closures).toHaveLength(1);
		expect(closures[0].name).toBe('Team Day');

		// Federal holidays should be fresh defaults (not the old ones)
		const holidays = (await ctx.store.findMany('special_days', 'test-org', {
			type: 'federal-holiday'
		})) as Array<Record<string, unknown>>;
		expect(holidays.length).toBeGreaterThan(0);
		expect(holidays.every((h) => h.id !== 'sd-old-1')).toBe(true);

		// Result should include all special days
		expect(result.length).toBeGreaterThan(holidays.length); // holidays + org-closure

		// Should audit the reset
		expect(ctx.audit.events[0].action).toBe('special_day.federal_holidays_reset');
	});

	it('rejects when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const resetUseCase = createResetFederalHolidaysUseCase();

		await expect(resetUseCase(ctx)).rejects.toMatchObject({ status: 403 });
	});

	it('requires edit permission on calendar', async () => {
		const ctx = buildContext({
			auth: {
				requireEdit() {
					throw new Error('No edit permission');
				}
			}
		});
		const resetUseCase = createResetFederalHolidaysUseCase();

		await expect(resetUseCase(ctx)).rejects.toThrow('No edit permission');
	});
});

import { afterEach, describe, it, expect, vi } from 'vitest';
import { createWritePortsContext } from './calendarPersistence.test-support.server';
import { deleteSpecialDay, resetFederalHolidays } from './specialDayOperations.server';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('SpecialDay delete use case', () => {
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

		await deleteSpecialDay(ctx, 'sd-1');

		const stored = await ctx.store.findOne('special_days', 'test-org', { id: 'sd-1' });
		expect(stored).toBeNull();
		expect(ctx.audit.events[0].action).toBe('special_day.deleted');
	});
});

describe('resetFederalHolidays use case', () => {
	afterEach(() => vi.useRealTimers());

	it('replaces only federal holidays with the four-year defaults and returns the saved federal rows', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 14, 12));
		const ctx = buildContext();
		ctx.store.seed('special_days', [
			{
				id: 'sd-old-1',
				date: '2025-01-01',
				name: 'Old New Year',
				type: 'federal-holiday',
				organization_id: 'test-org'
			},
			{ id: 'sd-closure', date: '2026-06-15', name: 'Team Day', type: 'org-closure', organization_id: 'test-org' }
		]);
		const reset = vi.spyOn(ctx.calendarCatalogs, 'resetFederalHolidays');

		const result = await resetFederalHolidays(ctx);

		const sent = reset.mock.calls[0][0];
		expect(sent).toHaveLength(44);
		expect(sent[0]).toEqual({ date: '2025-01-01', name: "New Year's Day" });
		expect(result).toHaveLength(44);
		expect(result.map(({ date, name, type }) => ({ date, name, type })).slice(0, 2)).toEqual([
			{ date: '2025-01-01', name: "New Year's Day", type: 'federal-holiday' },
			{ date: '2025-01-20', name: 'Martin Luther King Jr. Day', type: 'federal-holiday' }
		]);
		expect(result.map(({ date, name }) => ({ date, name })).slice(-2)).toEqual([
			{ date: '2028-11-23', name: 'Thanksgiving Day' },
			{ date: '2028-12-25', name: 'Christmas Day' }
		]);
		expect(result.some(({ id }) => id === 'sd-old-1' || id === 'sd-closure')).toBe(false);
		const stored = (await ctx.store.findMany('special_days', 'test-org')) as Array<{ id: string; type: string }>;
		expect(
			stored
				.filter(({ type }) => type === 'federal-holiday')
				.map(({ id }) => id)
				.sort()
		).toEqual(result.map(({ id }) => id).sort());
		expect(stored.find(({ id }) => id === 'sd-closure')).toMatchObject({ name: 'Team Day', type: 'org-closure' });
		expect(ctx.audit.events.map(({ action }) => action)).toEqual(['special_day.federal_holidays_reset']);
	});

	it('does not audit a reset the persistence did not confirm', async () => {
		const ctx = buildContext();
		vi.spyOn(ctx.calendarCatalogs, 'resetFederalHolidays').mockRejectedValue(new Error('reply lost'));
		await expect(resetFederalHolidays(ctx)).rejects.toThrow('reply lost');
		expect(ctx.audit.events).toEqual([]);
	});

	it('requires Calendar configure capability', async () => {
		const ctx = buildContext({
			auth: {
				capabilityMap: {
					calendar: 'operate',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});
		await expect(resetFederalHolidays(ctx)).rejects.toMatchObject({
			status: 403,
			message: 'This action requires Calendar configuration access'
		});
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar',
			details: {
				policyAction: 'calendar.configureSpecialDays',
				reasonCode: 'denied:missing-capability'
			}
		});
	});
});

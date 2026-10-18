import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext as basecreateTestContext } from '$lib/server/adapters/inMemory';

import {
	loadAvailabilityReadinessLane,
	loadLossTrackingReadinessLane,
	loadPersonnelDetailHeader
} from './personnelDetail.server';
const createTestContext = (overrides?: Parameters<typeof basecreateTestContext>[0]) =>
	withPersonnelPersistence(basecreateTestContext(overrides));

const AS_OF = '2026-05-14';
const listStatusTypes = async () => [{ id: 'tdy', name: 'TDY', color: '#000', textColor: '#fff' }];

async function seedPerson(ctx: ReturnType<typeof createTestContext>, overrides: Record<string, unknown> = {}) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: 'group-1',
			rank: 'SGT',
			last_name: 'Rivera',
			first_name: 'Monica',
			mos: '68W',
			clinic_role: 'Medic',
			ets: '2026-06-20',
			deros: null,
			archived_at: null,
			...overrides
		}
	]);
	return (await ctx.organizationPersonnel.findById('person-1'))!;
}

describe('personnel readiness lanes', () => {
	it('flags an active Calendar status for attention', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx);
		const listEntries = vi.fn().mockResolvedValue([
			{
				id: 'availability-1',
				personnelId: 'person-1',
				statusTypeId: 'tdy',
				startDate: '2026-05-13',
				endDate: '2026-05-15',
				note: 'Range support'
			}
		]);

		await expect(
			loadAvailabilityReadinessLane(ctx, person, AS_OF, listEntries, listStatusTypes)
		).resolves.toMatchObject({
			label: 'Availability',
			value: 'TDY',
			detail: 'TDY through May 15, 2026. Range support',
			tone: 'watch'
		});
	});

	it('reports present when Calendar entries are outside today', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx);
		const listEntries = vi.fn().mockResolvedValue([]);
		await expect(
			loadAvailabilityReadinessLane(ctx, person, AS_OF, listEntries, listStatusTypes)
		).resolves.toMatchObject({
			value: 'Present',
			tone: 'good'
		});
		expect(listEntries).toHaveBeenCalledWith({
			rangeStart: AS_OF,
			rangeEnd: AS_OF,
			personnelId: 'person-1',
			orderByEndDate: true
		});
	});

	it('denies availability without Calendar access before reading Calendar facts', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const person = await seedPerson(ctx);
		const listEntries = vi.fn(async () => []);
		const statusTypes = vi.fn(listStatusTypes);
		await expect(loadAvailabilityReadinessLane(ctx, person, AS_OF, listEntries, statusTypes)).rejects.toMatchObject(
			{ status: 403 }
		);
		expect(listEntries).not.toHaveBeenCalled();
		expect(statusTypes).not.toHaveBeenCalled();
	});

	it('calculates Loss Tracking from the Soldier ETS proximity', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx, { ets: '2026-06-20' });

		await expect(loadLossTrackingReadinessLane(ctx, person, AS_OF, async () => null)).resolves.toMatchObject({
			label: 'Loss Tracking',
			value: 'Action needed',
			detail: 'ETS Jun 20, 2026 is 37 days away.',
			tone: 'watch'
		});
	});

	it('retains the archived parent identity and record fields in the shared header', async () => {
		const ctx = createTestContext();
		await seedPerson(ctx, {
			slug: 'rivera-monica',
			archived_at: '2026-01-02T03:04:05.123456+00:00',
			groups: { name: 'Alpha' }
		});
		await expect(loadPersonnelDetailHeader(ctx, 'rivera-monica')).resolves.toEqual({
			person: {
				id: 'person-1',
				slug: 'rivera-monica',
				rank: 'SGT',
				lastName: 'Rivera',
				firstName: 'Monica',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: 'group-1',
				groupName: 'Alpha',
				ets: '2026-06-20',
				deros: null,
				archivedAt: '2026-01-02T03:04:05.123456+00:00'
			}
		});
	});

	it('does not return a header for a foreign Organization slug', async () => {
		const ctx = createTestContext();
		await seedPerson(ctx, { slug: 'rivera-monica', organization_id: 'foreign-org' });
		await expect(loadPersonnelDetailHeader(ctx, 'rivera-monica')).rejects.toMatchObject({ status: 404 });
	});
	it.each([
		['outside the member Group scope', ['other-group']],
		['for an empty Group scope', []]
	])('denies the header %s, so no lane is built', async (_, groupIds) => {
		const ctx = createTestContext({ auth: { role: 'member', scopeSet: { kind: 'groups', groupIds } } });
		await seedPerson(ctx, { slug: 'rivera-monica' });
		await expect(loadPersonnelDetailHeader(ctx, 'rivera-monica')).rejects.toMatchObject({ status: 403 });
	});


	it('propagates a Calendar read failure without replacing it with a healthy lane', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx);
		const failure = new Error('Calendar unavailable');
		await expect(
			loadAvailabilityReadinessLane(
				ctx,
				person,
				AS_OF,
				async () => {
					throw failure;
				},
				listStatusTypes
			)
		).rejects.toBe(failure);
	});

	it('keeps an unrecognized active status unavailable instead of reporting present', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx);
		await expect(
			loadAvailabilityReadinessLane(
				ctx,
				person,
				AS_OF,
				async () => [{ statusTypeId: 'unknown', startDate: AS_OF, endDate: AS_OF, note: null }],
				listStatusTypes
			)
		).resolves.toMatchObject({ value: 'Unavailable', tone: 'watch' });
	});

	it('reports missing ETS without reading settings even when DEROS is imminent', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx, { ets: null, deros: '2026-05-15' });
		const window = vi.fn(async () => 30);
		await expect(loadLossTrackingReadinessLane(ctx, person, AS_OF, window)).resolves.toMatchObject({
			value: 'Missing ETS',
			tone: 'bad'
		});
		expect(window).not.toHaveBeenCalled();
	});

	it.each([
		{ ets: '2026-05-13', window: 30, value: 'Action needed', tone: 'bad' },
		{ ets: '2026-05-14', window: 0, value: 'Action needed', tone: 'watch' },
		{ ets: '2026-05-15', window: 0, value: 'No loss risk', tone: 'good' },
		{ ets: '2026-06-13', window: 30, value: 'Action needed', tone: 'watch' },
		{ ets: '2026-06-14', window: 30, value: 'No loss risk', tone: 'good' }
	])('evaluates ETS $ets with the inclusive $window-day window', async ({ ets, window, value, tone }) => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx, { ets, deros: '2026-05-15' });
		await expect(loadLossTrackingReadinessLane(ctx, person, AS_OF, async () => window)).resolves.toMatchObject({
			value,
			tone
		});
	});

	it('says loss warnings are unavailable instead of guessing a window when settings fail', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx, { ets: '2026-07-14' });
		await expect(
			loadLossTrackingReadinessLane(ctx, person, AS_OF, async () => {
				throw new Error('Settings unavailable');
			})
		).resolves.toMatchObject({ value: 'Unavailable', tone: 'neutral' });
	});

	it('still reports a passed ETS when settings fail', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx, { ets: '2026-05-13' });
		await expect(
			loadLossTrackingReadinessLane(ctx, person, AS_OF, async () => {
				throw new Error('Settings unavailable');
			})
		).resolves.toMatchObject({ value: 'Action needed', tone: 'bad' });
	});

	it('does not flag an ETS 61 days out under a stored 60-day window', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx, { ets: '2026-07-14' });
		await expect(loadLossTrackingReadinessLane(ctx, person, AS_OF, async () => 60)).resolves.toMatchObject({
			value: 'No loss risk',
			tone: 'good'
		});
	});

	it('uses the default window when the setting is absent', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx, { ets: '2026-11-10' });
		await expect(loadLossTrackingReadinessLane(ctx, person, AS_OF, async () => null)).resolves.toMatchObject({
			value: 'Action needed',
			tone: 'watch'
		});
	});

	it('denies a Personnel loss read before consulting Organization settings', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const person = await seedPerson(ctx);
		const settings = vi.fn(async () => 30);
		await expect(loadLossTrackingReadinessLane(ctx, person, AS_OF, settings)).rejects.toMatchObject({
			status: 403
		});
		expect(settings).not.toHaveBeenCalled();
	});
});

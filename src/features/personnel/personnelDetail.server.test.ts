import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext as basecreateTestContext } from '$lib/server/adapters/inMemory';

import { loadAvailabilityToday, loadPersonnelDetailHeader } from './personnelDetail.server';
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

describe('personnel detail header reads', () => {
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

		await expect(loadAvailabilityToday(ctx, person, AS_OF, listEntries, listStatusTypes)).resolves.toEqual({
			value: 'TDY',
			detail: 'TDY through May 15, 2026. Range support',
			tone: 'watch'
		});
	});

	it('reports present when Calendar entries are outside today', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx);
		const listEntries = vi.fn().mockResolvedValue([]);
		await expect(loadAvailabilityToday(ctx, person, AS_OF, listEntries, listStatusTypes)).resolves.toMatchObject({
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

	it('hides availability from a viewer without Calendar access before reading Calendar facts', async () => {
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
		await expect(loadAvailabilityToday(ctx, person, AS_OF, listEntries, statusTypes)).resolves.toBeNull();
		expect(listEntries).not.toHaveBeenCalled();
		expect(statusTypes).not.toHaveBeenCalled();
	});

	it('retains the archived parent identity, record fields and service dates in the shared header', async () => {
		const ctx = createTestContext();
		await seedPerson(ctx, {
			slug: 'rivera-monica',
			archived_at: '2026-01-02T03:04:05.123456+00:00',
			groups: { name: 'Alpha' }
		});
		ctx.store.seed('personnel_extended_info', [
			{
				id: 'sheet-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				dod_id: '0123456789',
				basd: '2019-06-11',
				date_of_rank: '2023-02-01'
			}
		]);
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
			},
			basd: '2019-06-11',
			dodId: '0123456789',
			dateOfRank: '2023-02-01'
		});
	});

	it('leaves service dates empty when the Person has no data sheet', async () => {
		const ctx = createTestContext();
		await seedPerson(ctx, { slug: 'rivera-monica' });
		await expect(loadPersonnelDetailHeader(ctx, 'rivera-monica')).resolves.toMatchObject({
			dodId: null,
			basd: null,
			dateOfRank: null
		});
	});

	it('does not return a header for a foreign Organization slug', async () => {
		const ctx = createTestContext();
		await seedPerson(ctx, { slug: 'rivera-monica', organization_id: 'foreign-org' });
		await expect(loadPersonnelDetailHeader(ctx, 'rivera-monica')).rejects.toMatchObject({ status: 404 });
	});
	it('refuses the header and its DoD ID to a Personnel view-only member', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		await seedPerson(ctx, { slug: 'rivera-monica' });
		ctx.store.seed('personnel_extended_info', [
			{ id: 'sheet-1', organization_id: ctx.auth.orgId, personnel_id: 'person-1', dod_id: '0123456789' }
		]);
		await expect(loadPersonnelDetailHeader(ctx, 'rivera-monica')).rejects.toMatchObject({ status: 403 });
	});
	it.each([
		['outside the member Group scope', ['other-group']],
		['for an empty Group scope', []]
	])('denies the header %s, so no section is built', async (_, groupIds) => {
		const ctx = createTestContext({
			auth: { role: 'member', scopeSet: groupCoverageForTest({ kind: 'groups', groupIds }) }
		});
		await seedPerson(ctx, { slug: 'rivera-monica' });
		await expect(loadPersonnelDetailHeader(ctx, 'rivera-monica')).rejects.toMatchObject({ status: 403 });
	});

	it('propagates a Calendar read failure without replacing it with a healthy status', async () => {
		const ctx = createTestContext();
		const person = await seedPerson(ctx);
		const failure = new Error('Calendar unavailable');
		await expect(
			loadAvailabilityToday(
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
			loadAvailabilityToday(
				ctx,
				person,
				AS_OF,
				async () => [{ statusTypeId: 'unknown', startDate: AS_OF, endDate: AS_OF, note: null }],
				listStatusTypes
			)
		).resolves.toMatchObject({ value: 'Unavailable', tone: 'watch' });
	});
});

import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from './calendarPersistence.test-support.server';
import { createAvailability, deleteAvailability, updateAvailability } from './availabilityOperations.server';

const MISSING_ENTRY = '00000000-0000-4000-8000-000000000404';
const PERSON_1 = '00000000-0000-4000-8000-0000000000a1';
const PERSON_2 = '00000000-0000-4000-8000-0000000000a2';
const STATUS_1 = '00000000-0000-4000-8000-0000000000b1';
const STATUS_2 = '00000000-0000-4000-8000-0000000000b2';

describe('Calendar availability operations', () => {
	it('reports missing entries to Organization operators without disclosing them to Group members', async () => {
		const organization = createTestContext();
		await expect(updateAvailability(organization, { id: MISSING_ENTRY, note: 'Updated' })).rejects.toMatchObject({
			status: 404
		});
		await expect(deleteAvailability(organization, MISSING_ENTRY)).rejects.toMatchObject({ status: 404 });

		const scoped = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] })
			}
		});
		await expect(updateAvailability(scoped, { id: MISSING_ENTRY, note: 'Updated' })).rejects.toMatchObject({
			status: 403
		});
		await expect(deleteAvailability(scoped, MISSING_ENTRY)).rejects.toMatchObject({ status: 403 });
	});

	it('keeps a saved status attached to its Person and audits the single-record lifecycle', async () => {
		const ctx = createTestContext();
		const auditLog = vi.spyOn(ctx.audit, 'log');
		ctx.store.seed('personnel', [
			{ id: PERSON_1, organization_id: ctx.auth.orgId, group_id: null },
			{ id: PERSON_2, organization_id: ctx.auth.orgId, group_id: null }
		]);
		const created = (await createAvailability(ctx, {
			personnelId: PERSON_1,
			statusTypeId: STATUS_1,
			startDate: '2026-09-26',
			endDate: '2026-09-27'
		})) as { id: string; personnelId: string };
		await expect(
			updateAvailability(ctx, { id: created.id, personnelId: PERSON_2, statusTypeId: STATUS_2 })
		).rejects.toMatchObject({ status: 400 });
		const updated = await updateAvailability(ctx, { id: created.id, statusTypeId: STATUS_2 });
		expect(updated).toMatchObject({ id: created.id, personnelId: PERSON_1, statusTypeId: STATUS_2 });
		await deleteAvailability(ctx, created.id);
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toHaveLength(0);
		expect(auditLog.mock.calls.map(([event]) => event.action)).toEqual([
			'availability.created',
			'availability.updated',
			'availability.deleted'
		]);
	});
});

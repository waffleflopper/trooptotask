import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { createAvailabilityBatch, deleteAvailabilityBatch } from './availabilityBatch';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('createAvailabilityBatch', () => {
	const validRecords = [
		{ personnelId: 'p-1', statusTypeId: 'st-1', startDate: '2025-04-01', endDate: '2025-04-05' },
		{ personnelId: 'p-2', statusTypeId: 'st-2', startDate: '2025-04-02', endDate: '2025-04-06', note: 'TDY' }
	];

	it('inserts records, transforms result, and logs audit event', async () => {
		const ctx = buildContext();

		const result = await createAvailabilityBatch(ctx, { records: validRecords });

		// Returns inserted records in camelCase
		expect(result.inserted).toHaveLength(2);
		expect(result.inserted).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					personnelId: 'p-1',
					statusTypeId: 'st-1',
					startDate: '2025-04-01',
					endDate: '2025-04-05'
				}),
				expect.objectContaining({
					personnelId: 'p-2',
					statusTypeId: 'st-2',
					startDate: '2025-04-02',
					endDate: '2025-04-06',
					note: 'TDY'
				})
			])
		);

		// Data persisted in store
		const stored = await ctx.store.findMany('availability_entries', 'test-org');
		expect(stored).toHaveLength(2);

		// Audit logged with count
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'availability.bulk_created',
			resourceType: 'availability',
			details: { count: 2 }
		});
	});

	it('rejects empty records array', async () => {
		const ctx = buildContext();

		await expect(createAvailabilityBatch(ctx, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});

		const stored = await ctx.store.findMany('availability_entries', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('rejects when records exceed max batch size', async () => {
		const ctx = buildContext();
		const tooMany = Array.from({ length: 501 }, (_, i) => ({
			personnelId: `p-${i}`,
			statusTypeId: 'st-1',
			startDate: '2025-04-01',
			endDate: '2025-04-05'
		}));

		await expect(createAvailabilityBatch(ctx, { records: tooMany })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 records per batch'
		});
	});

	it('enforces policy scope on all personnel IDs in the batch', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopedGroupId: null,
				scopeSet: { kind: 'groups', groupIds: ['group-a'] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'p-1', organization_id: 'test-org', group_id: 'group-a' },
			{ id: 'p-2', organization_id: 'test-org', group_id: 'group-c' }
		]);

		await expect(createAvailabilityBatch(ctx, { records: validRecords })).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const stored = await ctx.store.findMany('availability_entries', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('requires Calendar operate capability and records denied-write audit details', async () => {
		const ctx = buildContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});

		await expect(createAvailabilityBatch(ctx, { records: validRecords })).rejects.toMatchObject({
			status: 403,
			message: 'This action requires Calendar operation access'
		});
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar',
			details: {
				policyAction: 'calendar.manageAvailability',
				reasonCode: 'denied:missing-capability'
			},
			severity: 'warning'
		});
	});

	it('denies Calendar writes outside a multi-Group scope through policy decisions', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopedGroupId: null,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-b'] }
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'p-1', organization_id: 'test-org', group_id: 'group-a' },
			{ id: 'p-2', organization_id: 'test-org', group_id: 'group-c' }
		]);

		await expect(createAvailabilityBatch(ctx, { records: validRecords })).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'policy.denied',
			details: {
				policyAction: 'calendar.manageAvailability',
				reasonCode: 'denied:out-of-scope',
				resource: { kind: 'group', groupId: 'group-c' }
			}
		});
	});

	it('lets read-only overlays block Calendar operate writes through policy decisions', async () => {
		const ctx = buildContext({ readOnly: true });

		await expect(createAvailabilityBatch(ctx, { records: validRecords })).rejects.toMatchObject({
			status: 403,
			message: 'Organization is in read-only mode'
		});
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'policy.denied',
			details: {
				policyAction: 'calendar.manageAvailability',
				reasonCode: 'denied:read-only-overlay',
				blockingOverlay: 'read-only-mode'
			}
		});
	});
});

describe('deleteAvailabilityBatch', () => {
	function seedEntries(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('availability_entries', [
			{
				id: 'e-1',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status_type_id: 'st-1',
				start_date: '2025-04-01',
				end_date: '2025-04-05'
			},
			{
				id: 'e-2',
				organization_id: 'test-org',
				personnel_id: 'p-2',
				status_type_id: 'st-2',
				start_date: '2025-04-02',
				end_date: '2025-04-06'
			},
			{
				id: 'e-keep',
				organization_id: 'test-org',
				personnel_id: 'p-3',
				status_type_id: 'st-1',
				start_date: '2025-04-03',
				end_date: '2025-04-07'
			}
		]);
	}

	it('deletes entries by IDs, audits, and returns count', async () => {
		const ctx = buildContext();
		seedEntries(ctx);

		const result = await deleteAvailabilityBatch(ctx, { ids: ['e-1', 'e-2'] });

		expect(result).toEqual({ deleted: 2 });

		// Only e-keep remains
		const remaining = await ctx.store.findMany('availability_entries', 'test-org');
		expect(remaining).toHaveLength(1);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'availability.bulk_deleted',
			resourceType: 'availability',
			details: { count: 2 }
		});
	});

	it('rejects empty IDs array', async () => {
		const ctx = buildContext();

		await expect(deleteAvailabilityBatch(ctx, { ids: [] })).rejects.toMatchObject({
			status: 400,
			message: 'ids array is required'
		});
	});

	it('rejects when IDs exceed max batch size', async () => {
		const ctx = buildContext();
		const tooMany = Array.from({ length: 501 }, (_, i) => `id-${i}`);

		await expect(deleteAvailabilityBatch(ctx, { ids: tooMany })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 ids per batch'
		});
	});

	it('enforces policy scope by looking up personnel from entries', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopedGroupId: null,
				scopeSet: { kind: 'groups', groupIds: ['group-a'] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'p-1', organization_id: 'test-org', group_id: 'group-a' },
			{ id: 'p-2', organization_id: 'test-org', group_id: 'group-c' },
			{ id: 'p-3', organization_id: 'test-org', group_id: 'group-a' }
		]);
		seedEntries(ctx);

		await expect(deleteAvailabilityBatch(ctx, { ids: ['e-1', 'e-2'] })).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		// Nothing deleted
		const remaining = await ctx.rawStore!.findMany('availability_entries', 'test-org');
		expect(remaining).toHaveLength(3);
	});
});

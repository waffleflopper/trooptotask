import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from './calendarPersistence.test-support.server';
import { createAvailabilityBatch, deleteAvailabilityBatch } from './availabilityBatch.server';

const PERSON_1 = '00000000-0000-4000-8000-000000000010';
const PERSON_2 = '00000000-0000-4000-8000-000000000011';
const PERSON_3 = '00000000-0000-4000-8000-000000000012';
const FOREIGN_PERSON = '00000000-0000-4000-8000-000000000013';
const STATUS_1 = '00000000-0000-4000-8000-000000000014';
const STATUS_2 = '00000000-0000-4000-8000-000000000015';
const ENTRY_1 = '00000000-0000-4000-8000-000000000016';
const ENTRY_2 = '00000000-0000-4000-8000-000000000017';
const ENTRY_KEEP = '00000000-0000-4000-8000-000000000018';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('createAvailabilityBatch', () => {
	const validRecords = [
		{ personnelId: PERSON_1, statusTypeId: STATUS_1, startDate: '2025-04-01', endDate: '2025-04-05' },
		{ personnelId: PERSON_2, statusTypeId: STATUS_2, startDate: '2025-04-02', endDate: '2025-04-06', note: 'TDY' }
	];

	it('inserts records, transforms result, and logs audit event', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{ id: PERSON_1, organization_id: 'test-org', group_id: 'group-a' },
			{ id: PERSON_2, organization_id: 'test-org', group_id: 'group-a' }
		]);

		const result = await createAvailabilityBatch(ctx, { records: validRecords });

		// Returns inserted records in camelCase
		expect(result.inserted).toHaveLength(2);
		expect(result.inserted).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					personnelId: PERSON_1,
					statusTypeId: STATUS_1,
					startDate: '2025-04-01',
					endDate: '2025-04-05'
				}),
				expect.objectContaining({
					personnelId: PERSON_2,
					statusTypeId: STATUS_2,
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
			body: { message: 'records array is required' }
		});

		const stored = await ctx.store.findMany('availability_entries', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('rejects when records exceed max batch size', async () => {
		const ctx = buildContext();
		const tooMany = Array.from({ length: 501 }, (_, i) => ({
			personnelId: `p-${i}`,
			statusTypeId: STATUS_1,
			startDate: '2025-04-01',
			endDate: '2025-04-05'
		}));

		await expect(createAvailabilityBatch(ctx, { records: tooMany })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Maximum 500 records per batch' }
		});
	});

	it('enforces policy scope on all personnel IDs in the batch', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
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
			{ id: PERSON_1, organization_id: 'test-org', group_id: 'group-a' },
			{ id: PERSON_2, organization_id: 'test-org', group_id: 'group-c' }
		]);

		await expect(createAvailabilityBatch(ctx, { records: validRecords })).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const stored = await ctx.store.findMany('availability_entries', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('rejects a foreign Person before writing any batch row', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{ id: PERSON_1, organization_id: 'test-org', group_id: 'group-a' },
			{ id: FOREIGN_PERSON, organization_id: 'another-org', group_id: 'group-a' }
		]);

		await expect(
			createAvailabilityBatch(ctx, {
				records: [validRecords[0], { ...validRecords[1], personnelId: FOREIGN_PERSON }]
			})
		).rejects.toMatchObject({ status: 404, body: { message: 'Person not found' } });
		expect(await ctx.store.findMany('availability_entries', 'test-org')).toHaveLength(0);
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
			{ id: PERSON_1, organization_id: 'test-org', group_id: 'group-a' },
			{ id: PERSON_2, organization_id: 'test-org', group_id: 'group-c' }
		]);

		await expect(createAvailabilityBatch(ctx, { records: validRecords })).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});
		// The scoped Personnel lookup does not reveal the hidden Group ID to the audit caller.
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'policy.denied',
			details: {
				policyAction: 'calendar.manageAvailability',
				reasonCode: 'denied:out-of-scope',
				resource: { kind: 'organization' }
			}
		});
	});
});

describe('deleteAvailabilityBatch', () => {
	function seedEntries(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('availability_entries', [
			{
				id: ENTRY_1,
				organization_id: 'test-org',
				personnel_id: PERSON_1,
				status_type_id: STATUS_1,
				start_date: '2025-04-01',
				end_date: '2025-04-05'
			},
			{
				id: ENTRY_2,
				organization_id: 'test-org',
				personnel_id: PERSON_2,
				status_type_id: STATUS_2,
				start_date: '2025-04-02',
				end_date: '2025-04-06'
			},
			{
				id: ENTRY_KEEP,
				organization_id: 'test-org',
				personnel_id: PERSON_3,
				status_type_id: STATUS_1,
				start_date: '2025-04-03',
				end_date: '2025-04-07'
			}
		]);
	}

	it('deletes entries by IDs, audits, and returns count', async () => {
		const ctx = buildContext();
		seedEntries(ctx);

		const result = await deleteAvailabilityBatch(ctx, { ids: [ENTRY_1, ENTRY_2] });

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
			body: { message: 'ids array is required' }
		});
	});

	it('rejects when IDs exceed max batch size', async () => {
		const ctx = buildContext();
		const tooMany = Array.from({ length: 501 }, (_, i) => `id-${i}`);

		await expect(deleteAvailabilityBatch(ctx, { ids: tooMany })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Maximum 500 ids per batch' }
		});
	});

	it('enforces policy scope by looking up personnel from entries', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
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
			{ id: PERSON_1, organization_id: 'test-org', group_id: 'group-a' },
			{ id: PERSON_2, organization_id: 'test-org', group_id: 'group-c' },
			{ id: PERSON_3, organization_id: 'test-org', group_id: 'group-a' }
		]);
		seedEntries(ctx);

		await expect(deleteAvailabilityBatch(ctx, { ids: [ENTRY_1, ENTRY_2] })).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		// Nothing deleted
		const remaining = await ctx.rawStore!.findMany('availability_entries', 'test-org');
		expect(remaining).toHaveLength(3);
	});
});

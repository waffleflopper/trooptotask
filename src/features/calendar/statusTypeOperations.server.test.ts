import { describe, it, expect } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import {
	createStatusType,
	updateStatusType,
	deleteStatusType,
	setStatusTypeOrder
} from './statusTypeOperations.server';

const ST_ID = '00000000-0000-4000-a000-000000000001';
const LEAVE = '00000000-0000-4000-a000-000000000011';
const SICK = '00000000-0000-4000-a000-000000000012';
const SCHOOL = '00000000-0000-4000-a000-000000000013';

function seedOrdered(ctx: ReturnType<typeof createWriteWithNotificationsPortsContext>) {
	ctx.store.seed(
		'status_types',
		[LEAVE, SICK, SCHOOL].map((id, position) => ({
			id,
			organization_id: ctx.auth.orgId,
			name: id,
			color: '#00ff00',
			text_color: '#ffffff',
			short_label: null,
			sort_order: position
		}))
	);
}

describe('StatusType CRUD use case', () => {
	it('creates a status type and audits', async () => {
		const ctx = createWriteWithNotificationsPortsContext();

		const result = (await createStatusType(ctx, {
			name: 'On Leave',
			color: '#00ff00',
			textColor: '#000000'
		})) as { name: string };

		expect(result).toMatchObject({ name: 'On Leave' });
		expect(ctx.audit.events[0].action).toBe('status_type.created');
	});

	it('edits a status label and color while retaining its other fields', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const historical = {
			id: ST_ID,
			organization_id: ctx.auth.orgId,
			name: 'Leave',
			color: '#00ff00',
			text_color: '#ffffff',
			sort_order: 3,
			created_at: '2030-01-01T00:00:00Z'
		};
		ctx.store.seed('status_types', [historical]);
		const result = await updateStatusType(ctx, { id: ST_ID, name: 'Annual Leave', color: '#22c55e' });
		expect(result).toEqual({
			id: ST_ID,
			organization_id: ctx.auth.orgId,
			name: 'Annual Leave',
			color: '#22c55e',
			textColor: '#ffffff',
			sortOrder: 3,
			created_at: '2030-01-01T00:00:00Z'
		});
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: ST_ID })).toEqual({
			...historical,
			name: 'Annual Leave',
			color: '#22c55e'
		});
		expect(ctx.audit.events[0]).toMatchObject({ action: 'status_type.updated', resourceId: ST_ID });
	});

	it('requires Calendar configure capability through the CRUD interface', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
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

		await expect(
			createStatusType(ctx, {
				name: 'On Leave',
				color: '#00ff00',
				textColor: '#000000'
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('status_types', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar',
			details: {
				policyAction: 'calendar.configureStatusTypes',
				reasonCode: 'denied:missing-capability'
			}
		});
	});

	it('allows an ordinary member with only Calendar configure capability', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: {
					calendar: 'configure',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await createStatusType(ctx, { name: 'TDY', color: '#00ff00', textColor: '#000000' });

		expect(await ctx.store.findMany('status_types', ctx.auth.orgId)).toMatchObject([{ name: 'TDY' }]);
		expect(ctx.audit.events).toMatchObject([{ action: 'status_type.created' }]);
	});

	it('does not audit success when status deletion fails', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		ctx.store.seed('status_types', [
			{
				id: ST_ID,
				name: 'On Leave',
				color: '#00ff00',
				text_color: '#000000',
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);
		ctx.store.delete = async () => {
			throw new Error('Status still has a historical reference');
		};
		await expect(deleteStatusType(ctx, ST_ID)).rejects.toThrow('historical reference');
		expect(await ctx.store.findOne('status_types', 'test-org', { id: ST_ID })).not.toBeNull();
		expect(ctx.audit.events.some((event) => event.action === 'status_type.deleted')).toBe(false);
		expect(ctx.notifications.notifications).toEqual([]);
	});

	it('deletes a saved status type and audits', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		ctx.store.seed('status_types', [
			{
				id: ST_ID,
				name: 'On Leave',
				color: '#00ff00',
				text_color: '#000000',
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);
		await deleteStatusType(ctx, ST_ID);
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: ST_ID })).toBeNull();
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({ action: 'status_type.deleted', resourceId: ST_ID })
		);
		expect(ctx.notifications.notifications).toContainEqual({
			target: 'admins',
			orgId: ctx.auth.orgId,
			excludeUserId: ctx.auth.userId,
			notification: {
				type: 'config_type_deleted',
				title: 'Status Type Deleted',
				message: 'A status type was deleted.'
			}
		});
	});

	it('stores a trimmed uppercase one-day label, clears a stored one when blank, and appends after the highest position', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const row = (id: string, organization_id: string, short_label: string | null, sort_order: number) => ({
			id,
			organization_id,
			name: id,
			color: '#00ff00',
			text_color: '#ffffff',
			short_label,
			sort_order
		});
		ctx.store.seed('status_types', [
			row(LEAVE, ctx.auth.orgId, null, 2),
			row(SICK, ctx.auth.orgId, 'SK', 9),
			row(SCHOOL, ctx.auth.orgId, null, 9),
			row(ST_ID, 'other-org', null, 40)
		]);

		const created = await createStatusType(ctx, { name: 'Medical', shortLabel: ' md ' });
		await updateStatusType(ctx, { id: SICK, shortLabel: '   ' });

		expect(
			await ctx.store.findOne('status_types', ctx.auth.orgId, { id: (created as { id: string }).id })
		).toMatchObject({ short_label: 'MD', sort_order: 10 });
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: SICK })).toMatchObject({
			short_label: null,
			sort_order: 9
		});
	});

	it.each([
		['a position on create', () => ({ name: 'TDY', sortOrder: 0 })],
		['a four-character one-day label', () => ({ name: 'TDY', shortLabel: 'ABCD' })]
	])('rejects %s with 400 before saving', async (_, input) => {
		const ctx = createWriteWithNotificationsPortsContext();
		await expect(createStatusType(ctx, input())).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('status_types', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('rejects a position on edit with 400 and leaves the order alone', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedOrdered(ctx);
		await expect(updateStatusType(ctx, { id: SCHOOL, sortOrder: 0 })).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: SCHOOL })).toMatchObject({ sort_order: 2 });
	});

	it('saves a full reorder against the order the editor saw and audits it', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedOrdered(ctx);
		await setStatusTypeOrder(ctx, {
			statusTypeIds: [SCHOOL, LEAVE, SICK],
			expectedStatusTypeIds: [LEAVE, SICK, SCHOOL]
		});
		const rows = await ctx.store.findMany<{ id: string; sort_order: number }>('status_types', ctx.auth.orgId);
		expect(Object.fromEntries(rows.map((row) => [row.id, row.sort_order]))).toEqual({
			[SCHOOL]: 0,
			[LEAVE]: 1,
			[SICK]: 2
		});
		expect(ctx.audit.events).toMatchObject([
			{
				action: 'status_type.reordered',
				resourceType: 'organization',
				resourceId: ctx.auth.orgId,
				details: { statusTypeIds: [SCHOOL, LEAVE, SICK] }
			}
		]);
	});

	it.each([
		['a stale view with 409', [SCHOOL, LEAVE, SICK], [SICK, LEAVE, SCHOOL], 409],
		['a partial order with 400', [SCHOOL, LEAVE], [LEAVE, SICK, SCHOOL], 400],
		['a repeated type with 400', [SCHOOL, SCHOOL, LEAVE], [LEAVE, SICK, SCHOOL], 400]
	])('answers %s without a change or an audit', async (_, statusTypeIds, expectedStatusTypeIds, status) => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedOrdered(ctx);
		await expect(setStatusTypeOrder(ctx, { statusTypeIds, expectedStatusTypeIds })).rejects.toMatchObject({ status });
		const rows = await ctx.store.findMany<{ id: string; sort_order: number }>('status_types', ctx.auth.orgId);
		expect(Object.fromEntries(rows.map((row) => [row.id, row.sort_order]))).toEqual({
			[LEAVE]: 0,
			[SICK]: 1,
			[SCHOOL]: 2
		});
		expect(ctx.audit.events).toEqual([]);
	});
});

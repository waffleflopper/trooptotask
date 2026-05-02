import { describe, it, expect } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createRatingSchemeEntryUseCases } from './ratingSchemeEntryCrud';

function buildContext(overrides?: Parameters<typeof createTestContext>[0]) {
	return createTestContext(overrides);
}

const validInput = {
	ratedPersonId: 'person-1',
	evalType: 'OER',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-06-30',
	status: 'draft'
};

describe('Rating scheme entry — create', () => {
	it('uses Rating Scheme policy decisions instead of the legacy edit lane before mutating', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				isFullEditor: false,
				requireEdit() {
					throw new Error('legacy requireEdit should not authorize Rating Scheme writes');
				},
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				}
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);
		const { create } = createRatingSchemeEntryUseCases();

		await create(ctx, { ...validInput });

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.created',
			resourceType: 'rating_scheme'
		});
	});

	it('creates an entry, persists it, and audits', async () => {
		const ctx = buildContext();
		const { create } = createRatingSchemeEntryUseCases();

		const result = (await create(ctx, { ...validInput })) as Record<string, unknown>;

		expect(result).toMatchObject({
			ratedPersonId: 'person-1',
			evalType: 'OER',
			status: 'draft'
		});

		const stored = await ctx.store.findMany('rating_scheme_entries', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.created',
			resourceType: 'rating_scheme'
		});
	});

	it('coerces empty strings to null on create', async () => {
		const ctx = buildContext();
		const { create } = createRatingSchemeEntryUseCases();

		await create(ctx, { ...validInput, raterName: '', seniorRaterName: '' });

		const stored = (await ctx.store.findMany('rating_scheme_entries', 'test-org')) as Record<string, unknown>[];
		expect(stored[0].rater_name).toBeNull();
		expect(stored[0].senior_rater_name).toBeNull();
	});

	it('rejects create when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { create } = createRatingSchemeEntryUseCases();

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
	});

	it('denies create through an authoritative Rating Scheme policy decision and audits the attempt', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'view'
				}
			}
		});
		const { create } = createRatingSchemeEntryUseCases();

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'rating_scheme',
				details: expect.objectContaining({
					policyAction: 'ratingScheme.updateEntries',
					reasonCode: 'denied:missing-capability'
				}),
				severity: 'warning'
			})
		);
	});

	it('honors multi-Group scope when creating a scoped rating scheme entry', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-c'] }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: 'group-c'
			}
		]);
		const { create } = createRatingSchemeEntryUseCases();

		const result = (await create(ctx, { ...validInput })) as Record<string, unknown>;

		expect(result.ratedPersonId).toBe('person-1');
	});

	it('treats unassigned rated people as unscoped for scoped Rating Scheme writes', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);
		const { create } = createRatingSchemeEntryUseCases();

		const result = (await create(ctx, { ...validInput })) as Record<string, unknown>;

		expect(result.ratedPersonId).toBe('person-1');
	});

	it('denies create outside the member multi-Group scope set', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-c'] }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: 'group-b'
			}
		]);
		const { create } = createRatingSchemeEntryUseCases();

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'rating_scheme',
				details: expect.objectContaining({
					policyAction: 'ratingScheme.updateEntries',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});

describe('Rating scheme entry — update', () => {
	it('updates an entry and audits', async () => {
		const ctx = buildContext();
		const { update } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-06-30',
				status: 'draft',
				organization_id: 'test-org'
			}
		]);

		const result = (await update(ctx, { id: 'rs-1', status: 'complete' })) as Record<string, unknown>;
		expect(result.status).toBe('complete');

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.updated',
			resourceId: 'rs-1'
		});
	});

	it('coerces empty strings to null on update', async () => {
		const ctx = buildContext();
		const { update } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-06-30',
				status: 'draft',
				rater_name: 'Old Rater',
				organization_id: 'test-org'
			}
		]);

		await update(ctx, { id: 'rs-1', raterName: '' });

		const stored = (await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' })) as Record<
			string,
			unknown
		>;
		expect(stored.rater_name).toBeNull();
	});
});

describe('Rating scheme entry — delete', () => {
	it('deletes entry, audits, and notifies admins', async () => {
		const ctx = buildContext();
		const { remove } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'draft',
				organization_id: 'test-org'
			}
		]);
		await remove(ctx, 'rs-1');

		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' });
		expect(stored).toBeNull();

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.deleted',
			resourceId: 'rs-1'
		});

		const notifications = ctx.notificationPort.notifications;
		expect(notifications).toHaveLength(1);
	});

	it('returns requiresApproval for non-privileged, non-full-editor users', async () => {
		const ctx = buildContext({
			auth: { isPrivileged: false, isFullEditor: false, role: 'member' }
		});
		const { remove } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'draft',
				organization_id: 'test-org'
			}
		]);

		const result = await remove(ctx, 'rs-1');
		expect(result).toMatchObject({ requiresApproval: true });

		// Entry should NOT be deleted
		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' });
		expect(stored).not.toBeNull();
	});

	it('rejects delete when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { remove } = createRatingSchemeEntryUseCases();

		await expect(remove(ctx, 'rs-1')).rejects.toMatchObject({ status: 403 });
	});

	it('audits read-only delete denial through the Rating Scheme policy overlay', async () => {
		const ctx = buildContext({ readOnly: true });
		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'draft',
				organization_id: 'test-org'
			}
		]);
		const { remove } = createRatingSchemeEntryUseCases();

		await expect(remove(ctx, 'rs-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'rating_scheme',
				resourceId: 'rs-1',
				details: expect.objectContaining({
					policyAction: 'ratingScheme.updateEntries',
					reasonCode: 'denied:read-only-overlay'
				})
			})
		);
	});
});

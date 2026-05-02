import { describe, it, expect } from 'vitest';
import { createWriteWithSubscriptionPortsContext } from '$lib/server/adapters/inMemory';
import { createPersonnelUseCases } from './personnel';

function buildContext(overrides?: Parameters<typeof createWriteWithSubscriptionPortsContext>[0]) {
	return createWriteWithSubscriptionPortsContext(overrides);
}

const validInput = {
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'John',
	mos: '11B',
	clinicRole: 'Team Leader',
	groupId: null
};

describe('Personnel — create', () => {
	it('inserts personnel, invalidates tier cache, and audits', async () => {
		const ctx = buildContext();
		const { create } = createPersonnelUseCases();

		const result = (await create(ctx, { ...validInput })) as Record<string, unknown>;

		expect(result).toMatchObject({
			lastName: 'Smith',
			firstName: 'John',
			rank: 'SGT'
		});

		const stored = await ctx.store.findMany('personnel', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.subscription.tierCacheInvalidated).toBe(true);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.created',
			resourceType: 'personnel'
		});
	});

	it('persists ETS and DEROS on create', async () => {
		const ctx = buildContext();
		const { create } = createPersonnelUseCases();

		await create(ctx, {
			...validInput,
			ets: '2027-05-01',
			deros: '2026-11-30'
		});

		const stored = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(stored[0]).toMatchObject({
			ets: '2027-05-01',
			deros: '2026-11-30'
		});
	});

	it('rejects create when subscription cap exceeded', async () => {
		const ctx = buildContext({ subscriptionAllowed: false, subscriptionMessage: 'Personnel limit reached (20)' });
		const { create } = createPersonnelUseCases();

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
	});

	it('rejects create when scoped user targets wrong group', async () => {
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-a'] } } });
		const { create } = createPersonnelUseCases();

		await expect(create(ctx, { ...validInput, groupId: 'group-b' })).rejects.toMatchObject({ status: 403 });
	});

	it('denies create through an authoritative Personnel policy decision and audits the attempt', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { create } = createPersonnelUseCases();

		await expect(create(ctx, { ...validInput, groupId: 'group-a' })).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				details: expect.objectContaining({
					policyAction: 'personnel.manageRecords',
					reasonCode: 'denied:missing-capability'
				}),
				severity: 'warning'
			})
		);
	});

	it('allows scoped user to create in their own group', async () => {
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-a'] } } });
		const { create } = createPersonnelUseCases();

		const result = (await create(ctx, { ...validInput, groupId: 'group-a' })) as Record<string, unknown>;
		expect(result).toMatchObject({ firstName: 'John' });
	});

	it('allows multi-Group scoped users to create in any assigned group', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'operate',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-b'] }
			}
		});
		const { create } = createPersonnelUseCases();

		const result = (await create(ctx, { ...validInput, groupId: 'group-b' })) as Record<string, unknown>;

		expect(result).toMatchObject({ firstName: 'John', groupId: 'group-b' });
	});

	it('rejects create when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { create } = createPersonnelUseCases();

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
	});
});

describe('Personnel — update', () => {
	function seedPersonnel(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);
	}

	it('updates personnel and audits', async () => {
		const ctx = buildContext();
		const { update } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = (await update(ctx, { id: 'p-1', rank: 'SSG' })) as Record<string, unknown>;
		expect(result.rank).toBe('SSG');

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.updated',
			resourceId: 'p-1'
		});
	});

	it('updates ETS and DEROS on update', async () => {
		const ctx = buildContext();
		const { update } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await update(ctx, { id: 'p-1', ets: '2027-05-01', deros: null });

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.ets).toBe('2027-05-01');
		expect(stored.deros).toBeNull();
	});

	it('coerces empty groupId to null on update', async () => {
		const ctx = buildContext();
		const { update } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await update(ctx, { id: 'p-1', groupId: '' });

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.group_id).toBeNull();
	});

	it('enforces group scope on update', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-a'] },
				async requireGroupAccess() {
					throw groupAccessError;
				}
			}
		});
		const { update } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await expect(update(ctx, { id: 'p-1', rank: 'SSG' })).rejects.toMatchObject({ status: 403 });
	});

	it('rejects update when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { update } = createPersonnelUseCases();

		await expect(update(ctx, { id: 'p-1', rank: 'SSG' })).rejects.toMatchObject({ status: 403 });
	});
});

describe('Personnel — archive', () => {
	function seedPersonnel(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);
	}

	it('sets archived_at, invalidates tier cache, and audits', async () => {
		const ctx = buildContext();
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await archive(ctx, 'p-1');

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();

		expect(ctx.subscription.tierCacheInvalidated).toBe(true);

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.archived',
			resourceId: 'p-1'
		});
	});

	it('returns requiresApproval for non-privileged, non-full-editor users', async () => {
		const ctx = buildContext({
			auth: {
				isPrivileged: false,
				role: 'member',
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await archive(ctx, 'p-1');
		expect(result).toMatchObject({ requiresApproval: true });

		// Should NOT have archived
		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeNull();

		// Should NOT have invalidated tier cache
		expect(ctx.subscription.tierCacheInvalidated).toBe(false);
	});

	it('archives directly for a configure-capable member without relying on full-editor compatibility', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await archive(ctx, 'p-1');

		expect(result).toBeUndefined();
		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();
		expect(ctx.subscription.tierCacheInvalidated).toBe(true);
	});

	it('enforces group scope on archive', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-a'] },
				async requireGroupAccess() {
					throw groupAccessError;
				}
			}
		});
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await expect(archive(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
	});

	it('rejects archive when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { archive } = createPersonnelUseCases();

		await expect(archive(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
	});
});

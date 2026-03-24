import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createPersonnelUseCases } from './personnel';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
	subscription: ReturnType<typeof createTestSubscriptionPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
	subscriptionAllowed?: boolean;
	subscriptionMessage?: string;
}): TestContext {
	const auditPort = createTestAuditPort();
	const subscription = createTestSubscriptionPort(
		overrides?.subscriptionAllowed ?? true,
		overrides?.subscriptionMessage
	);
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext(overrides?.auth),
		audit: auditPort,
		auditPort,
		readOnlyGuard: createTestReadOnlyGuard(overrides?.readOnly ?? false),
		subscription
	};
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

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'personnel.created',
			resourceType: 'personnel'
		});
	});

	it('rejects create when subscription cap exceeded', async () => {
		const ctx = buildContext({ subscriptionAllowed: false, subscriptionMessage: 'Personnel limit reached (15)' });
		const { create } = createPersonnelUseCases();

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
	});

	it('rejects create when scoped user targets wrong group', async () => {
		const ctx = buildContext({ auth: { scopedGroupId: 'group-a' } });
		const { create } = createPersonnelUseCases();

		await expect(create(ctx, { ...validInput, groupId: 'group-b' })).rejects.toMatchObject({ status: 403 });
	});

	it('allows scoped user to create in their own group', async () => {
		const ctx = buildContext({ auth: { scopedGroupId: 'group-a' } });
		const { create } = createPersonnelUseCases();

		const result = (await create(ctx, { ...validInput, groupId: 'group-a' })) as Record<string, unknown>;
		expect(result).toMatchObject({ firstName: 'John' });
	});

	it('rejects create when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { create } = createPersonnelUseCases();

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
	});
});

describe('Personnel — update', () => {
	function seedPersonnel(ctx: TestContext) {
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

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'personnel.updated',
			resourceId: 'p-1'
		});
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
				scopedGroupId: 'group-a',
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
	function seedPersonnel(ctx: TestContext) {
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

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'personnel.archived',
			resourceId: 'p-1'
		});
	});

	it('returns requiresApproval for non-privileged, non-full-editor users', async () => {
		const ctx = buildContext({
			auth: { isPrivileged: false, isFullEditor: false, role: 'member' }
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

	it('enforces group scope on archive', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
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

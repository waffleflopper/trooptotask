import { describe, it, expect } from 'vitest';
import { createTestContext, createWriteWithSubscriptionPortsContext } from '$lib/server/adapters/inMemory';
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

	it('generates a human-readable slug from the Soldier name on create', async () => {
		const ctx = buildContext();
		const { create } = createPersonnelUseCases();

		const result = (await create(ctx, {
			...validInput,
			lastName: 'Rivera',
			firstName: 'Monica'
		})) as Record<string, unknown>;

		expect(result.slug).toBe('rivera-monica');

		const stored = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(stored[0].slug).toBe('rivera-monica');
	});

	it('appends a numeric suffix when another Soldier in the same Organization has the same slug', async () => {
		const ctx = buildContext();
		const { create } = createPersonnelUseCases();

		await create(ctx, { ...validInput, lastName: 'Smith', firstName: 'John' });
		const duplicate = (await create(ctx, { ...validInput, lastName: 'Smith', firstName: 'John' })) as Record<
			string,
			unknown
		>;

		expect(duplicate.slug).toBe('smith-john-2');
	});

	it('checks slug collisions against the whole organization for group-scoped creators', async () => {
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-a'] } } });
		const { create } = createPersonnelUseCases();
		ctx.store.seed('personnel', [
			{
				id: 'p-other-group',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: 'group-b',
				slug: 'smith-john'
			}
		]);

		const created = (await create(ctx, { ...validInput, groupId: 'group-a' })) as Record<string, unknown>;

		expect(created.slug).toBe('smith-john-2');
	});

	it('retries slug generation when a concurrent create claims the same slug first', async () => {
		const ctx = buildContext();
		const { create } = createPersonnelUseCases();
		const insert = ctx.store.insert.bind(ctx.store);
		let injectedCollision = false;

		ctx.store.insert = async (table, orgId, data, select) => {
			if (table === 'personnel' && data.slug === 'smith-john' && !injectedCollision) {
				injectedCollision = true;
				await insert(table, orgId, { ...data, id: 'p-concurrent', slug: 'smith-john' }, select);
				throw new Error('duplicate key value violates unique constraint "personnel_org_slug_key"');
			}
			return insert(table, orgId, data, select);
		};

		const created = (await create(ctx, { ...validInput, lastName: 'Smith', firstName: 'John' })) as Record<
			string,
			unknown
		>;

		expect(created.slug).toBe('smith-john-2');
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
					policyAction: 'personnel.createRecords',
					reasonCode: 'denied:missing-capability'
				}),
				severity: 'warning'
			})
		);
	});

	it('allows configure-capable scoped user to create in their own group', async () => {
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-a'] } } });
		const { create } = createPersonnelUseCases();

		const result = (await create(ctx, { ...validInput, groupId: 'group-a' })) as Record<string, unknown>;
		expect(result).toMatchObject({ firstName: 'John' });
	});

	it('denies operators from creating personnel records', async () => {
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

		await expect(create(ctx, { ...validInput, groupId: 'group-b' })).rejects.toMatchObject({ status: 403 });
	});

	it('allows configure-capable multi-Group scoped users to create in any assigned group', async () => {
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

	it('regenerates only the renamed Soldier slug on name change', async () => {
		const ctx = buildContext();
		const { update } = createPersonnelUseCases();
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Rivera',
				first_name: 'Monica',
				slug: 'rivera-monica',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			},
			{
				id: 'p-2',
				rank: 'SSG',
				last_name: 'Smith',
				first_name: 'John',
				slug: 'smith-john',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);

		const result = (await update(ctx, { id: 'p-1', lastName: 'Smith', firstName: 'John' })) as Record<string, unknown>;

		expect(result.slug).toBe('smith-john-2');

		const unchanged = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-2' })) as Record<string, unknown>;
		expect(unchanged.slug).toBe('smith-john');
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
		const ctx = buildContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { update } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await expect(update(ctx, { id: 'p-1', rank: 'SSG' })).rejects.toMatchObject({ status: 403 });
	});

	it('rejects update when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { update } = createPersonnelUseCases();
		seedPersonnel(ctx);

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

	function seedPersonnelArtifacts(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-open',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status: 'open',
				archived_at: null
			},
			{
				id: 'follow-up-completed',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status: 'completed',
				archived_at: null
			}
		]);
		ctx.store.seed('counseling_records', [
			{
				id: 'counseling-active',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				archived_at: null
			}
		]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'document-active',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				archived_at: null
			}
		]);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-active',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				archived_at: null
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

	it('archives all personnel-owned artifacts when archiving personnel', async () => {
		const ctx = buildContext();
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);

		await archive(ctx, 'p-1');

		const followUps = (await ctx.store.findMany('personnel_follow_ups', 'test-org')) as Record<string, unknown>[];
		const counselings = (await ctx.store.findMany('counseling_records', 'test-org')) as Record<string, unknown>[];
		const documents = (await ctx.store.findMany('personnel_documents', 'test-org')) as Record<string, unknown>[];
		const notes = (await ctx.store.findMany('leader_notes', 'test-org')) as Record<string, unknown>[];

		expect(followUps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'follow-up-open', status: 'archived', archived_at: expect.any(String) }),
				expect.objectContaining({ id: 'follow-up-completed', status: 'archived', archived_at: expect.any(String) })
			])
		);
		expect(counselings[0].archived_at).toEqual(expect.any(String));
		expect(documents[0].archived_at).toEqual(expect.any(String));
		expect(notes[0].archived_at).toEqual(expect.any(String));
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
		const ctx = buildContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await expect(archive(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
	});

	it('allows archive when read-only so organizations can return below personnel limits', async () => {
		const ctx = buildContext({ readOnly: true });
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await archive(ctx, 'p-1');

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();
	});
});

describe('Personnel — archive batch', () => {
	function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			},
			{
				id: 'p-2',
				rank: 'SSG',
				last_name: 'Jones',
				first_name: 'Pat',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);
	}

	function seedPersonnelArtifacts(ctx: ReturnType<typeof createTestContext>) {
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-p1',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status: 'open',
				archived_at: null
			},
			{
				id: 'follow-up-p2',
				organization_id: 'test-org',
				personnel_id: 'p-2',
				status: 'open',
				archived_at: null
			}
		]);
		ctx.store.seed('counseling_records', [
			{ id: 'counseling-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'counseling-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
		ctx.store.seed('personnel_documents', [
			{ id: 'document-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'document-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
		ctx.store.seed('leader_notes', [
			{ id: 'note-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'note-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
	}

	it('archives multiple personnel through one use case call', async () => {
		const ctx = createTestContext();
		const { archiveBatch } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await archiveBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		expect(result).toEqual({
			archivedIds: ['p-1', 'p-2'],
			approvalRequestedIds: [],
			errors: []
		});
		const stored = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(stored.every((person) => person.archived_at)).toBe(true);
		expect(ctx.subscription.tierCacheInvalidated).toBe(true);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.bulk_archived',
				resourceType: 'personnel',
				details: expect.objectContaining({ count: 2, ids: ['p-1', 'p-2'] })
			})
		);
	});

	it('archives personnel-owned artifacts for every directly archived personnel record', async () => {
		const ctx = createTestContext();
		const { archiveBatch } = createPersonnelUseCases();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);

		await archiveBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		const followUps = (await ctx.store.findMany('personnel_follow_ups', 'test-org')) as Record<string, unknown>[];
		const counselings = (await ctx.store.findMany('counseling_records', 'test-org')) as Record<string, unknown>[];
		const documents = (await ctx.store.findMany('personnel_documents', 'test-org')) as Record<string, unknown>[];
		const notes = (await ctx.store.findMany('leader_notes', 'test-org')) as Record<string, unknown>[];

		expect(followUps.every((row) => row.status === 'archived' && row.archived_at)).toBe(true);
		expect(counselings.every((row) => row.archived_at)).toBe(true);
		expect(documents.every((row) => row.archived_at)).toBe(true);
		expect(notes.every((row) => row.archived_at)).toBe(true);
	});

	it('creates archival requests in the same call when direct archive requires approval', async () => {
		const ctx = createTestContext({
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
		const { archiveBatch } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await archiveBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		expect(result).toEqual({
			archivedIds: [],
			approvalRequestedIds: ['p-1', 'p-2'],
			errors: []
		});
		const requests = (await ctx.store.findMany('deletion_requests', 'test-org')) as Record<string, unknown>[];
		expect(requests).toHaveLength(2);
		expect(requests).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-1', status: 'pending' }),
				expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-2', status: 'pending' })
			])
		);
	});

	it('allows batch archive in read-only mode so organizations can return below personnel limits', async () => {
		const ctx = createTestContext({ readOnly: true });
		const { archiveBatch } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await archiveBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		expect(result.archivedIds).toEqual(['p-1', 'p-2']);
		const stored = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(stored.every((person) => person.archived_at)).toBe(true);
	});
});

import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { describe, it, expect } from 'vitest';
import { createWritePortsContext as basecreateWritePortsContext } from '$lib/server/adapters/inMemory';

import { createPersonnelRecord, updatePersonnelRecord } from './personnelRecordOperations.server';
const createWritePortsContext = (overrides?: Parameters<typeof basecreateWritePortsContext>[0]) =>
	withPersonnelPersistence(basecreateWritePortsContext(overrides));

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	const ctx = createWritePortsContext(overrides);
	ctx.store.seed('groups', [
		{ id: 'group-a', organization_id: ctx.auth.orgId, name: 'Alpha' },
		{ id: 'group-b', organization_id: ctx.auth.orgId, name: 'Bravo' },
		{ id: 'foreign-group', organization_id: 'foreign-org', name: 'Foreign' }
	]);
	seedRankCatalog(ctx, [
		{ code: 'SPC', label: 'Specialist', pay_grade: 'E-4' },
		{ code: 'PFC', label: 'Private First Class', pay_grade: 'E-3' },
		{ code: 'SGT', label: 'Sergeant', pay_grade: 'E-5' },
		{ code: 'SSG', label: 'Staff Sergeant', pay_grade: 'E-6' }
	]);
	return ctx;
}

const validInput = {
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'John',
	mos: '11B',
	clinicRole: 'Team Leader',
	groupId: null
};

function buildScopedCreatorContext() {
	return buildContext({
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
			scopeSet: { kind: 'groups', groupIds: ['group-a'] }
		}
	});
}

// The ordinary request client cannot read another Group, while the database's
// Organization-wide slug constraint still rejects a conflicting write.
function scopedSlugProvider(ctx: ReturnType<typeof buildContext>) {
	const rawStore = ctx.rawStore ?? ctx.store;
	const findAll = rawStore.findMany.bind(rawStore);
	const insert = ctx.store.insert.bind(ctx.store);
	const update = ctx.store.update.bind(ctx.store);
	const attemptedSlugs: unknown[] = [];
	rawStore.findMany = async <T>(...args: Parameters<typeof rawStore.findMany>): Promise<T[]> => {
		const [table, orgId, filters, options] = args;
		const rows = await findAll<Record<string, unknown>>(table, orgId, filters, options);
		return (table === 'personnel' ? rows.filter((row) => row.group_id === 'group-a') : rows) as T[];
	};
	async function rejectCollision(table: string, orgId: string, data: Record<string, unknown>, id?: string) {
		if (table !== 'personnel') return;
		attemptedSlugs.push(data.slug);
		const rows = await findAll<{ id: string; slug: string }>(table, orgId);
		if (rows.some((row) => row.id !== id && row.slug === data.slug)) {
			throw Object.assign(new Error('duplicate key value violates unique constraint "personnel_org_slug_key"'), {
				code: '23505'
			});
		}
	}
	ctx.store.insert = async (table, orgId, data, select) => {
		await rejectCollision(table, orgId, data);
		return insert(table, orgId, data, select);
	};
	ctx.store.update = async (table, orgId, id, data, select) => {
		await rejectCollision(table, orgId, data, id);
		return update(table, orgId, id, data, select);
	};
	return { findAll, attemptedSlugs };
}

describe('Personnel URLs when another Group owns the name', () => {
	it.each(['create', 'update'] as const)(
		'%s advances past hidden collisions without changing other Personnel records',
		async (operation) => {
			const ctx = buildScopedCreatorContext();
			const hidden = ['smith-john', 'smith-john-2'].map((slug, index) => ({
				id: `hidden-${index}`,
				organization_id: ctx.auth.orgId,
				group_id: 'group-b',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				slug,
				ets: '2028-07-01',
				archived_at: index === 0 ? null : '2026-08-01T12:00:00Z'
			}));
			const original = {
				id: 'renamed-person',
				organization_id: ctx.auth.orgId,
				group_id: 'group-a',
				rank: 'SGT',
				last_name: 'Rivera',
				first_name: 'Monica',
				slug: 'rivera-monica',
				ets: '2027-05-01',
				deros: '2027-06-01',
				archived_at: null
			};
			ctx.store.seed('personnel', [
				...hidden.map((row) => ({ ...row })),
				...(operation === 'update' ? [{ ...original }] : [])
			]);
			const provider = scopedSlugProvider(ctx);
			const result =
				operation === 'create'
					? await createPersonnelRecord(ctx, { ...validInput, groupId: 'group-a' })
					: await updatePersonnelRecord(ctx, { id: original.id, lastName: 'Smith', firstName: 'John' });

			expect(result).toMatchObject({ slug: 'smith-john-3', groupId: 'group-a' });
			const rows = await provider.findAll<Record<string, unknown>>('personnel', ctx.auth.orgId);
			expect(rows.filter((row) => row.group_id === 'group-b')).toEqual(hidden);
			expect(rows).toHaveLength(3);
			if (operation === 'update') {
				expect(rows.find((row) => row.id === original.id)).toEqual({
					...original,
					last_name: 'Smith',
					first_name: 'John',
					slug: 'smith-john-3'
				});
			}
			expect(ctx.audit.events).toEqual([
				expect.objectContaining({ action: `personnel.${operation === 'create' ? 'created' : 'updated'}` })
			]);
		}
	);

	it.each(['create', 'update'] as const)(
		'%s stops after three occupied URL candidates without side effects',
		async (operation) => {
			const ctx = buildScopedCreatorContext();
			const originals = ['smith-john', 'smith-john-2', 'smith-john-3'].map((slug, index) => ({
				id: `hidden-${index}`,
				organization_id: ctx.auth.orgId,
				group_id: 'group-b',
				slug
			}));
			if (operation === 'update')
				originals.push({
					id: 'renamed-person',
					organization_id: ctx.auth.orgId,
					group_id: 'group-a',
					slug: 'rivera-monica'
				});
			ctx.store.seed(
				'personnel',
				originals.map((row) => ({ ...row }))
			);
			const provider = scopedSlugProvider(ctx);
			const result =
				operation === 'create'
					? createPersonnelRecord(ctx, { ...validInput, groupId: 'group-a' })
					: updatePersonnelRecord(ctx, { id: 'renamed-person', lastName: 'Smith', firstName: 'John' });
			await expect(result).rejects.toMatchObject({ code: '23505' });
			expect(provider.attemptedSlugs).toEqual(['smith-john', 'smith-john-2', 'smith-john-3']);
			expect(await provider.findAll('personnel', ctx.auth.orgId)).toEqual(originals);
			expect(ctx.audit.events).toEqual([]);
		}
	);
});

describe('Personnel Group organization integrity', () => {
	it.each(['foreign-group', 'missing-group'])('rejects create referencing %s without side effects', async (groupId) => {
		const ctx = buildContext();
		await expect(createPersonnelRecord(ctx, { ...validInput, groupId })).rejects.toMatchObject({
			status: 404
		});
		expect(await ctx.store.findMany('personnel', ctx.auth.orgId)).toEqual([]);
		expect(await ctx.store.findMany('personnel', 'foreign-org')).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each(['foreign-group', 'missing-group'])(
		'rejects an explicit update to %s before changing any fields',
		async (groupId) => {
			const ctx = buildContext();
			const original = {
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: 'group-a',
				slug: 'smith-john',
				ets: '2027-05-01',
				deros: '2027-06-01',
				clinic_role: 'Team Leader'
			};
			ctx.store.seed('personnel', [{ ...original }]);
			await expect(
				updatePersonnelRecord(ctx, {
					id: original.id,
					groupId,
					lastName: 'Changed',
					clinicRole: 'Changed',
					ets: null
				})
			).rejects.toMatchObject({ status: 404 });
			expect(await ctx.store.findMany('personnel', ctx.auth.orgId)).toEqual([original]);
			expect(ctx.audit.events).toEqual([]);
		}
	);

	it('reassigns between same-Organization Groups and unassigns while retaining the Person identity and dates', async () => {
		const ctx = buildContext();
		const created = (await createPersonnelRecord(ctx, { ...validInput, groupId: 'group-a', ets: '2027-05-01' })) as {
			id: string;
		};
		await updatePersonnelRecord(ctx, { id: created.id, groupId: 'group-b' });
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: created.id })).toMatchObject({
			id: created.id,
			group_id: 'group-b',
			slug: 'smith-john',
			ets: '2027-05-01'
		});
		await updatePersonnelRecord(ctx, { id: created.id, groupId: null });
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: created.id })).toMatchObject({
			id: created.id,
			group_id: null,
			slug: 'smith-john',
			ets: '2027-05-01'
		});
	});

	it('leaves a historical foreign reference unchanged when an update omits Group, but rejects explicitly resubmitting it', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{ id: 'legacy-person', organization_id: ctx.auth.orgId, group_id: 'foreign-group', rank: 'SGT' }
		]);
		await updatePersonnelRecord(ctx, { id: 'legacy-person', clinicRole: 'Reviewed role' });
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'legacy-person' })).toMatchObject({
			id: 'legacy-person',
			group_id: 'foreign-group',
			clinic_role: 'Reviewed role'
		});
		await expect(updatePersonnelRecord(ctx, { id: 'legacy-person', groupId: 'foreign-group' })).rejects.toMatchObject({
			status: 404
		});
	});
});

function seedRankCatalog(ctx: ReturnType<typeof buildContext>, entries: Array<Record<string, unknown>>) {
	ctx.store.seed(
		'organization_rank_catalog',
		entries.map((entry, index) => ({
			organization_id: ctx.auth.orgId,
			code: 'SGT',
			label: 'Sergeant',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-5',
			state: 'active',
			source: 'built-in',
			sort_order: index,
			...entry
		}))
	);
}

describe('Personnel — create', () => {
	it('inserts personnel and audits without a subscription provider', async () => {
		const ctx = buildContext();

		const result = await createPersonnelRecord(ctx, { ...validInput });

		expect(result).toMatchObject({
			lastName: 'Smith',
			firstName: 'John',
			rank: 'SGT'
		});

		const stored = await ctx.store.findMany('personnel', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.created',
			resourceType: 'personnel'
		});
	});

	it('persists ETS and DEROS on create', async () => {
		const ctx = buildContext();

		await createPersonnelRecord(ctx, {
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

		const result = await createPersonnelRecord(ctx, {
			...validInput,
			lastName: 'Rivera',
			firstName: 'Monica'
		});

		expect(result.slug).toBe('rivera-monica');

		const stored = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(stored[0].slug).toBe('rivera-monica');
	});

	it('appends a numeric suffix when another Soldier in the same Organization has the same slug', async () => {
		const ctx = buildContext();

		await createPersonnelRecord(ctx, { ...validInput, lastName: 'Smith', firstName: 'John' });
		const duplicate = await createPersonnelRecord(ctx, { ...validInput, lastName: 'Smith', firstName: 'John' });

		expect(duplicate.slug).toBe('smith-john-2');
	});

	it('checks slug collisions against the whole organization for group-scoped creators', async () => {
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-a'] } } });
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

		const created = await createPersonnelRecord(ctx, { ...validInput, groupId: 'group-a' });

		expect(created.slug).toBe('smith-john-2');
	});

	it('retries slug generation when a concurrent create claims the same slug first', async () => {
		const ctx = buildContext();
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

		const created = await createPersonnelRecord(ctx, { ...validInput, lastName: 'Smith', firstName: 'John' });

		expect(created.slug).toBe('smith-john-2');
	});

	it('rejects create when scoped user targets wrong group', async () => {
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-a'] } } });

		await expect(createPersonnelRecord(ctx, { ...validInput, groupId: 'group-b' })).rejects.toMatchObject({
			status: 403
		});
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

		await expect(createPersonnelRecord(ctx, { ...validInput, groupId: 'group-a' })).rejects.toMatchObject({
			status: 403
		});
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

		const result = await createPersonnelRecord(ctx, { ...validInput, groupId: 'group-a' });
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

		await expect(createPersonnelRecord(ctx, { ...validInput, groupId: 'group-b' })).rejects.toMatchObject({
			status: 403
		});
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

		const result = await createPersonnelRecord(ctx, { ...validInput, groupId: 'group-b' });

		expect(result).toMatchObject({ firstName: 'John', groupId: 'group-b' });
	});

	it('normalizes create rank input through the active Organization rank catalog', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [
			{
				code: 'PO3',
				label: 'Petty Officer Third Class',
				service: 'navy',
				pay_grade: 'E-4'
			}
		]);

		const result = await createPersonnelRecord(ctx, { ...validInput, rank: 'po3' });

		expect(result.rank).toBe('PO3');
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: result.id })).resolves.toMatchObject({
			rank: 'PO3'
		});
	});

	it('rejects retired Organization catalog ranks on create with reactivation guidance', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [{ code: 'SP4', label: 'Specialist Four', pay_grade: 'E-4', state: 'retired' }]);

		await expect(createPersonnelRecord(ctx, { ...validInput, rank: 'SP4' })).rejects.toMatchObject({
			status: 400,
			message:
				'Rank "SP4" is retired. Reactivate it in the Organization rank catalog before using it for Personnel create, edit, or import.'
		});
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
		seedPersonnel(ctx);

		const result = await updatePersonnelRecord(ctx, { id: 'p-1', rank: 'SSG' });
		expect(result.rank).toBe('SSG');

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.updated',
			resourceId: 'p-1'
		});
	});

	it('normalizes changed update rank input through the active Organization rank catalog', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedRankCatalog(ctx, [
			{
				code: 'PO3',
				label: 'Petty Officer Third Class',
				service: 'navy',
				pay_grade: 'E-4'
			}
		]);

		const result = await updatePersonnelRecord(ctx, { id: 'p-1', rank: 'po3' });

		expect(result.rank).toBe('PO3');
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			rank: 'PO3'
		});
	});

	it('normalizes legacy case-collided stored ranks when the selected active catalog code differs', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [
			{ code: 'CAPT', label: 'Captain', service: 'navy', category: 'officer', pay_grade: 'O-6' },
			{ code: 'Capt', label: 'Captain', service: 'air-force', category: 'officer', pay_grade: 'O-3' }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'p-case-collided-rank',
				rank: 'capt',
				last_name: 'Legacy',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);

		const result = await updatePersonnelRecord(ctx, { id: 'p-case-collided-rank', rank: 'CAPT' });

		expect(result.rank).toBe('CAPT');
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-case-collided-rank' })).resolves.toMatchObject(
			{
				rank: 'CAPT'
			}
		);
	});

	it('preserves an existing retired rank when update leaves rank unchanged', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [{ code: 'SP4', label: 'Specialist Four', pay_grade: 'E-4', state: 'retired' }]);
		ctx.store.seed('personnel', [
			{
				id: 'p-retired-rank',
				rank: 'SP4',
				last_name: 'Legacy',
				first_name: 'Sam',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);

		const result = await updatePersonnelRecord(ctx, { id: 'p-retired-rank', clinicRole: 'Operations' });

		expect(result).toMatchObject({ rank: 'SP4', clinicRole: 'Operations' });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-retired-rank' })).resolves.toMatchObject({
			rank: 'SP4',
			clinic_role: 'Operations'
		});
	});

	it('preserves an existing retired rank when update echoes the same rank with casing or whitespace differences', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [{ code: 'SP4', label: 'Specialist Four', pay_grade: 'E-4', state: 'retired' }]);
		ctx.store.seed('personnel', [
			{
				id: 'p-retired-rank',
				rank: 'SP4',
				last_name: 'Legacy',
				first_name: 'Sam',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);

		const result = await updatePersonnelRecord(ctx, {
			id: 'p-retired-rank',
			rank: ' sp4 ',
			clinicRole: 'Operations'
		});

		expect(result).toMatchObject({ rank: 'SP4', clinicRole: 'Operations' });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-retired-rank' })).resolves.toMatchObject({
			rank: 'SP4',
			clinic_role: 'Operations'
		});
	});

	it('updates ETS and DEROS on update', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);

		await updatePersonnelRecord(ctx, { id: 'p-1', ets: '2027-05-01', deros: null });

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.ets).toBe('2027-05-01');
		expect(stored.deros).toBeNull();
	});

	it('regenerates only the renamed Soldier slug on name change', async () => {
		const ctx = buildContext();
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

		const result = await updatePersonnelRecord(ctx, { id: 'p-1', lastName: 'Smith', firstName: 'John' });

		expect(result.slug).toBe('smith-john-2');

		const unchanged = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-2' })) as Record<string, unknown>;
		expect(unchanged.slug).toBe('smith-john');
	});

	it('coerces empty groupId to null on update', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);

		await updatePersonnelRecord(ctx, { id: 'p-1', groupId: '' });

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.group_id).toBeNull();
	});

	it('enforces group scope on update', async () => {
		const ctx = buildContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		seedPersonnel(ctx);

		await expect(updatePersonnelRecord(ctx, { id: 'p-1', rank: 'SSG' })).rejects.toMatchObject({ status: 403 });
	});
});

import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { describe, it, expect } from 'vitest';
import { createWritePortsContext as basecreateWritePortsContext } from '$lib/server/adapters/inMemory';

import { createPersonnelRecord, updatePersonnelRecord } from './personnelRecordOperations.server';
const GROUP_A = '00000000-0000-4000-8000-0000000000a1';
const GROUP_B = '00000000-0000-4000-8000-0000000000b1';
const FOREIGN_GROUP = '00000000-0000-4000-8000-0000000000f1';
const MISSING_GROUP = '00000000-0000-4000-8000-0000000000e1';
const PERSON_1 = '00000000-0000-4000-8000-000000000001';
const PERSON_2 = '00000000-0000-4000-8000-000000000002';
const RETIRED_RANK_PERSON = '00000000-0000-4000-8000-000000000003';
const CASE_COLLIDED_RANK_PERSON = '00000000-0000-4000-8000-000000000004';
const LEGACY_PERSON = '00000000-0000-4000-8000-000000000005';
const RENAMED_PERSON = '00000000-0000-4000-8000-000000000006';
const OTHER_GROUP_PERSON = '00000000-0000-4000-8000-000000000007';
const CONCURRENT_PERSON = '00000000-0000-4000-8000-000000000008';

const createWritePortsContext = (overrides?: Parameters<typeof basecreateWritePortsContext>[0]) =>
	withPersonnelPersistence(basecreateWritePortsContext(overrides));

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	const ctx = createWritePortsContext(overrides);
	ctx.store.seed('groups', [
		{ id: GROUP_A, organization_id: ctx.auth.orgId, name: 'Alpha' },
		{ id: GROUP_B, organization_id: ctx.auth.orgId, name: 'Bravo' },
		{ id: FOREIGN_GROUP, organization_id: 'foreign-org', name: 'Foreign' }
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
			scopeSet: { kind: 'groups', groupIds: [GROUP_A] }
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
		return (table === 'personnel' ? rows.filter((row) => row.group_id === GROUP_A) : rows) as T[];
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
				id: `00000000-0000-4000-8000-00000000c00${index}`,
				organization_id: ctx.auth.orgId,
				group_id: GROUP_B,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				slug,
				ets: '2028-07-01',
				archived_at: index === 0 ? null : '2026-08-01T12:00:00Z'
			}));
			const original = {
				id: RENAMED_PERSON,
				organization_id: ctx.auth.orgId,
				group_id: GROUP_A,
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
					? await createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_A })
					: await updatePersonnelRecord(ctx, { id: original.id, lastName: 'Smith', firstName: 'John' });

			expect(result).toMatchObject({ slug: 'smith-john-3', groupId: GROUP_A });
			const rows = await provider.findAll<Record<string, unknown>>('personnel', ctx.auth.orgId);
			expect(rows.filter((row) => row.group_id === GROUP_B)).toEqual(hidden);
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
				id: `00000000-0000-4000-8000-00000000c00${index}`,
				organization_id: ctx.auth.orgId,
				group_id: GROUP_B,
				slug
			}));
			if (operation === 'update')
				originals.push({
					id: RENAMED_PERSON,
					organization_id: ctx.auth.orgId,
					group_id: GROUP_A,
					slug: 'rivera-monica'
				});
			ctx.store.seed(
				'personnel',
				originals.map((row) => ({ ...row }))
			);
			const provider = scopedSlugProvider(ctx);
			const result =
				operation === 'create'
					? createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_A })
					: updatePersonnelRecord(ctx, { id: RENAMED_PERSON, lastName: 'Smith', firstName: 'John' });
			await expect(result).rejects.toMatchObject({ code: '23505' });
			expect(provider.attemptedSlugs).toEqual(['smith-john', 'smith-john-2', 'smith-john-3']);
			expect(await provider.findAll('personnel', ctx.auth.orgId)).toEqual(originals);
			expect(ctx.audit.events).toEqual([]);
		}
	);
});

describe('Personnel Group organization integrity', () => {
	it.each([
		[FOREIGN_GROUP, FOREIGN_GROUP],
		['missing-group', MISSING_GROUP]
	])('rejects create referencing %s without side effects', async (_label, groupId) => {
		const ctx = buildContext();
		await expect(createPersonnelRecord(ctx, { ...validInput, groupId })).rejects.toMatchObject({
			status: 404
		});
		expect(await ctx.store.findMany('personnel', ctx.auth.orgId)).toEqual([]);
		expect(await ctx.store.findMany('personnel', 'foreign-org')).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([
		[FOREIGN_GROUP, FOREIGN_GROUP],
		['missing-group', MISSING_GROUP]
	])('rejects an explicit update to %s before changing any fields', async (_label, groupId) => {
		const ctx = buildContext();
		const original = {
			id: PERSON_1,
			organization_id: ctx.auth.orgId,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			group_id: GROUP_A,
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
	});

	it('reassigns between same-Organization Groups and unassigns while retaining the Person identity and dates', async () => {
		const ctx = buildContext();
		const created = (await createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_A, ets: '2027-05-01' })) as {
			id: string;
		};
		await updatePersonnelRecord(ctx, { id: created.id, groupId: GROUP_B });
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: created.id })).toMatchObject({
			id: created.id,
			group_id: GROUP_B,
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
			{ id: LEGACY_PERSON, organization_id: ctx.auth.orgId, group_id: FOREIGN_GROUP, rank: 'SGT' }
		]);
		await updatePersonnelRecord(ctx, { id: LEGACY_PERSON, clinicRole: 'Reviewed role' });
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: LEGACY_PERSON })).toMatchObject({
			id: LEGACY_PERSON,
			group_id: FOREIGN_GROUP,
			clinic_role: 'Reviewed role'
		});
		await expect(updatePersonnelRecord(ctx, { id: LEGACY_PERSON, groupId: FOREIGN_GROUP })).rejects.toMatchObject({
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

	it.each([
		['lastName', 'Last name is required'],
		['firstName', 'First name is required']
	])('rejects a whitespace-only %s on create', async (field, message) => {
		const ctx = buildContext();

		await expect(createPersonnelRecord(ctx, { ...validInput, [field]: '   ' })).rejects.toMatchObject({
			status: 400,
			message
		});
		expect(await ctx.store.findMany('personnel', 'test-org')).toEqual([]);
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
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: [GROUP_A] } } });
		ctx.store.seed('personnel', [
			{
				id: OTHER_GROUP_PERSON,
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: GROUP_B,
				slug: 'smith-john'
			}
		]);

		const created = await createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_A });

		expect(created.slug).toBe('smith-john-2');
	});

	it('retries slug generation when a concurrent create claims the same slug first', async () => {
		const ctx = buildContext();
		const insert = ctx.store.insert.bind(ctx.store);
		let injectedCollision = false;

		ctx.store.insert = async (table, orgId, data, select) => {
			if (table === 'personnel' && data.slug === 'smith-john' && !injectedCollision) {
				injectedCollision = true;
				await insert(table, orgId, { ...data, id: CONCURRENT_PERSON, slug: 'smith-john' }, select);
				throw new Error('duplicate key value violates unique constraint "personnel_org_slug_key"');
			}
			return insert(table, orgId, data, select);
		};

		const created = await createPersonnelRecord(ctx, { ...validInput, lastName: 'Smith', firstName: 'John' });

		expect(created.slug).toBe('smith-john-2');
	});

	it('rejects create when scoped user targets wrong group', async () => {
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: [GROUP_A] } } });

		await expect(createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_B })).rejects.toMatchObject({
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
				scopeSet: { kind: 'groups', groupIds: [GROUP_A] }
			}
		});

		await expect(createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_A })).rejects.toMatchObject({
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
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: [GROUP_A] } } });

		const result = await createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_A });
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
				scopeSet: { kind: 'groups', groupIds: [GROUP_A, GROUP_B] }
			}
		});

		await expect(createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_B })).rejects.toMatchObject({
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
				scopeSet: { kind: 'groups', groupIds: [GROUP_A, GROUP_B] }
			}
		});

		const result = await createPersonnelRecord(ctx, { ...validInput, groupId: GROUP_B });

		expect(result).toMatchObject({ firstName: 'John', groupId: GROUP_B });
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
				id: PERSON_1,
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

		const result = await updatePersonnelRecord(ctx, { id: PERSON_1, rank: 'SSG' });
		expect(result.rank).toBe('SSG');

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.updated',
			resourceId: PERSON_1
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

		const result = await updatePersonnelRecord(ctx, { id: PERSON_1, rank: 'po3' });

		expect(result.rank).toBe('PO3');
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: PERSON_1 })).resolves.toMatchObject({
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
				id: CASE_COLLIDED_RANK_PERSON,
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

		const result = await updatePersonnelRecord(ctx, { id: CASE_COLLIDED_RANK_PERSON, rank: 'CAPT' });

		expect(result.rank).toBe('CAPT');
		await expect(
			ctx.store.findOne('personnel', ctx.auth.orgId, { id: CASE_COLLIDED_RANK_PERSON })
		).resolves.toMatchObject({
			rank: 'CAPT'
		});
	});

	it('preserves an existing retired rank when update leaves rank unchanged', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [{ code: 'SP4', label: 'Specialist Four', pay_grade: 'E-4', state: 'retired' }]);
		ctx.store.seed('personnel', [
			{
				id: RETIRED_RANK_PERSON,
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

		const result = await updatePersonnelRecord(ctx, { id: RETIRED_RANK_PERSON, clinicRole: 'Operations' });

		expect(result).toMatchObject({ rank: 'SP4', clinicRole: 'Operations' });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: RETIRED_RANK_PERSON })).resolves.toMatchObject({
			rank: 'SP4',
			clinic_role: 'Operations'
		});
	});

	it('preserves an existing retired rank when update echoes the same rank with casing or whitespace differences', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [{ code: 'SP4', label: 'Specialist Four', pay_grade: 'E-4', state: 'retired' }]);
		ctx.store.seed('personnel', [
			{
				id: RETIRED_RANK_PERSON,
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
			id: RETIRED_RANK_PERSON,
			rank: ' sp4 ',
			clinicRole: 'Operations'
		});

		expect(result).toMatchObject({ rank: 'SP4', clinicRole: 'Operations' });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: RETIRED_RANK_PERSON })).resolves.toMatchObject({
			rank: 'SP4',
			clinic_role: 'Operations'
		});
	});

	it('updates ETS and DEROS on update', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);

		await updatePersonnelRecord(ctx, { id: PERSON_1, ets: '2027-05-01', deros: null });

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: PERSON_1 })) as Record<string, unknown>;
		expect(stored.ets).toBe('2027-05-01');
		expect(stored.deros).toBeNull();
	});

	it('regenerates only the renamed Soldier slug on name change', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: PERSON_1,
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
				id: PERSON_2,
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

		const result = await updatePersonnelRecord(ctx, { id: PERSON_1, lastName: 'Smith', firstName: 'John' });

		expect(result.slug).toBe('smith-john-2');

		const unchanged = (await ctx.store.findOne('personnel', 'test-org', { id: PERSON_2 })) as Record<string, unknown>;
		expect(unchanged.slug).toBe('smith-john');
	});

	it.each([
		['lastName', 'Last name is required'],
		['firstName', 'First name is required']
	])('rejects a whitespace-only %s on update and keeps the stored name and slug', async (field, message) => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: PERSON_1,
				rank: 'SGT',
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

		await expect(updatePersonnelRecord(ctx, { id: PERSON_1, [field]: ' ' })).rejects.toMatchObject({
			status: 400,
			message
		});

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: PERSON_1 })) as Record<string, unknown>;
		expect(stored).toMatchObject({ last_name: 'Smith', first_name: 'John', slug: 'smith-john' });
		expect(ctx.audit.events).toEqual([]);
	});

	it('coerces empty groupId to null on update', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);

		await updatePersonnelRecord(ctx, { id: PERSON_1, groupId: '' });

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: PERSON_1 })) as Record<string, unknown>;
		expect(stored.group_id).toBeNull();
	});

	it('enforces group scope on update', async () => {
		const ctx = buildContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: [GROUP_A] }
			}
		});
		seedPersonnel(ctx);

		await expect(updatePersonnelRecord(ctx, { id: PERSON_1, rank: 'SSG' })).rejects.toMatchObject({ status: 403 });
	});
});

describe('Personnel truthful rejection of invalid and stale writes', () => {
	it.each([
		['a numeric rank', { rank: 5 }, 'Rank is required'],
		['a null MOS', { mos: null }, 'MOS must be text'],
		['an unreadable ETS', { ets: 'soon' }, 'Use a valid date (YYYY-MM-DD)'],
		['an impossible ETS', { ets: '2027-02-30' }, 'Use a valid date (YYYY-MM-DD)'],
		['a Group that is not an id', { groupId: 'alpha' }, 'Invalid ID']
	])('rejects a create with %s with 400 and saves nothing', async (_case, change, message) => {
		const ctx = buildContext();

		await expect(createPersonnelRecord(ctx, { ...validInput, ...change })).rejects.toMatchObject({
			status: 400,
			message
		});
		expect(await ctx.store.findMany('personnel', ctx.auth.orgId)).toEqual([]);
	});

	it.each([
		['a malformed id', { id: 'abc', clinicRole: 'Medic' }, 'Invalid ID'],
		['a numeric duty role', { id: PERSON_1, clinicRole: 42 }, 'Duty role is required'],
		['an impossible DEROS', { id: PERSON_1, deros: '2027-13-01' }, 'Use a valid date (YYYY-MM-DD)']
	])('rejects an update with %s with 400', async (_case, input, message) => {
		const ctx = buildContext();

		await expect(updatePersonnelRecord(ctx, input)).rejects.toMatchObject({ status: 400, message });
		expect(ctx.audit.events.some((event) => event.action === 'personnel.updated')).toBe(false);
	});

	it('answers 404 for an update to a Person that is missing or in another Organization', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{ id: PERSON_2, organization_id: 'foreign-org', rank: 'SGT', last_name: 'Other', first_name: 'Org' }
		]);

		for (const id of [PERSON_1, PERSON_2]) {
			await expect(updatePersonnelRecord(ctx, { id, clinicRole: 'Medic' })).rejects.toMatchObject({
				status: 404,
				message: 'This person is no longer available.'
			});
		}
		expect(await ctx.store.findOne('personnel', 'foreign-org', { id: PERSON_2 })).toMatchObject({ last_name: 'Other' });
		expect(ctx.audit.events.some((event) => event.action === 'personnel.updated')).toBe(false);
	});
});

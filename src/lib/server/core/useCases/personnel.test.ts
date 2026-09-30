import { describe, it, expect, vi } from 'vitest';
import { createTestContext, createWritePortsContext } from '$lib/server/adapters/inMemory';
import { createPersonnelUseCases } from './personnel';

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

describe('Personnel Group organization integrity', () => {
	it.each(['foreign-group', 'missing-group'])('rejects create referencing %s without side effects', async (groupId) => {
		const ctx = buildContext();
		await expect(createPersonnelUseCases().create(ctx, { ...validInput, groupId })).rejects.toMatchObject({
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
				createPersonnelUseCases().update(ctx, {
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
		const operations = createPersonnelUseCases();
		const created = (await operations.create(ctx, { ...validInput, groupId: 'group-a', ets: '2027-05-01' })) as {
			id: string;
		};
		await operations.update(ctx, { id: created.id, groupId: 'group-b' });
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: created.id })).toMatchObject({
			id: created.id,
			group_id: 'group-b',
			slug: 'smith-john',
			ets: '2027-05-01'
		});
		await operations.update(ctx, { id: created.id, groupId: null });
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
		const operations = createPersonnelUseCases();
		await operations.update(ctx, { id: 'legacy-person', clinicRole: 'Reviewed role' });
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'legacy-person' })).toMatchObject({
			id: 'legacy-person',
			group_id: 'foreign-group',
			clinic_role: 'Reviewed role'
		});
		await expect(operations.update(ctx, { id: 'legacy-person', groupId: 'foreign-group' })).rejects.toMatchObject({
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
		const { create } = createPersonnelUseCases();

		const result = (await create(ctx, { ...validInput })) as Record<string, unknown>;

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

	it('normalizes create rank input through the active Organization rank catalog', async () => {
		const ctx = buildContext();
		const { create } = createPersonnelUseCases();
		seedRankCatalog(ctx, [
			{
				code: 'PO3',
				label: 'Petty Officer Third Class',
				service: 'navy',
				pay_grade: 'E-4'
			}
		]);

		const result = (await create(ctx, { ...validInput, rank: 'po3' })) as Record<string, unknown>;

		expect(result.rank).toBe('PO3');
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: result.id })).resolves.toMatchObject({
			rank: 'PO3'
		});
	});

	it('rejects retired Organization catalog ranks on create with reactivation guidance', async () => {
		const ctx = buildContext();
		const { create } = createPersonnelUseCases();
		seedRankCatalog(ctx, [{ code: 'SP4', label: 'Specialist Four', pay_grade: 'E-4', state: 'retired' }]);

		await expect(create(ctx, { ...validInput, rank: 'SP4' })).rejects.toMatchObject({
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
		const { update } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = (await update(ctx, { id: 'p-1', rank: 'SSG' })) as Record<string, unknown>;
		expect(result.rank).toBe('SSG');

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.updated',
			resourceId: 'p-1'
		});
	});

	it('normalizes changed update rank input through the active Organization rank catalog', async () => {
		const ctx = buildContext();
		const { update } = createPersonnelUseCases();
		seedPersonnel(ctx);
		seedRankCatalog(ctx, [
			{
				code: 'PO3',
				label: 'Petty Officer Third Class',
				service: 'navy',
				pay_grade: 'E-4'
			}
		]);

		const result = (await update(ctx, { id: 'p-1', rank: 'po3' })) as Record<string, unknown>;

		expect(result.rank).toBe('PO3');
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			rank: 'PO3'
		});
	});

	it('normalizes legacy case-collided stored ranks when the selected active catalog code differs', async () => {
		const ctx = buildContext();
		const { update } = createPersonnelUseCases();
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

		const result = (await update(ctx, { id: 'p-case-collided-rank', rank: 'CAPT' })) as Record<string, unknown>;

		expect(result.rank).toBe('CAPT');
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-case-collided-rank' })).resolves.toMatchObject(
			{
				rank: 'CAPT'
			}
		);
	});

	it('preserves an existing retired rank when update leaves rank unchanged', async () => {
		const ctx = buildContext();
		const { update } = createPersonnelUseCases();
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

		const result = (await update(ctx, { id: 'p-retired-rank', clinicRole: 'Operations' })) as Record<string, unknown>;

		expect(result).toMatchObject({ rank: 'SP4', clinicRole: 'Operations' });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-retired-rank' })).resolves.toMatchObject({
			rank: 'SP4',
			clinic_role: 'Operations'
		});
	});

	it('preserves an existing retired rank when update echoes the same rank with casing or whitespace differences', async () => {
		const ctx = buildContext();
		const { update } = createPersonnelUseCases();
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

		const result = (await update(ctx, {
			id: 'p-retired-rank',
			rank: ' sp4 ',
			clinicRole: 'Operations'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ rank: 'SP4', clinicRole: 'Operations' });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-retired-rank' })).resolves.toMatchObject({
			rank: 'SP4',
			clinic_role: 'Operations'
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

	it('sets archived_at and audits', async () => {
		const ctx = buildContext();
		const { archive } = createPersonnelUseCases();
		seedPersonnel(ctx);

		await archive(ctx, 'p-1');

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.archived',
			resourceId: 'p-1'
		});
	});

	it('archives personnel-owned artifacts without reopening completed follow-ups later', async () => {
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
				expect.objectContaining({ id: 'follow-up-completed', status: 'completed', archived_at: null })
			])
		);
		expect(counselings[0].archived_at).toEqual(expect.any(String));
		expect(documents[0].archived_at).toEqual(expect.any(String));
		expect(notes[0].archived_at).toEqual(expect.any(String));
	});

	it.each([false, true])(
		'preserves the archive event on replay and restores its artifacts (interrupted: %s)',
		async (interrupted) => {
			const ctx = buildContext();
			const operations = createPersonnelUseCases();
			seedPersonnel(ctx);
			seedPersonnelArtifacts(ctx);
			const original = await ctx.store.findOne<Record<string, unknown>>('personnel', ctx.auth.orgId, { id: 'p-1' });
			const olderArchive = '2026-08-01T12:00:00.000Z';
			await ctx.store.insert('leader_notes', ctx.auth.orgId, {
				id: 'note-independent',
				personnel_id: 'p-1',
				archived_at: olderArchive
			});
			const writes = ctx.personnelArtifactWrites!;
			const forPeople = writes.forPeople.bind(writes);
			let failNote = interrupted;
			writes.forPeople = async (...args) => {
				const writer = await forPeople(...args);
				return {
					...writer,
					async update(table, row, patch) {
						if (table === 'leader_notes' && failNote) {
							failNote = false;
							throw new Error('note archive interrupted');
						}
						await writer.update(table, row, patch);
					}
				};
			};
			const firstArchive = '2026-09-30T14:00:00.000Z';
			vi.useFakeTimers({ toFake: ['Date'] });
			try {
				vi.setSystemTime(new Date(firstArchive));
				if (interrupted) await expect(operations.archive(ctx, 'p-1')).rejects.toThrow('note archive interrupted');
				else await operations.archive(ctx, 'p-1');
				expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual({
					...original,
					archived_at: firstArchive
				});
				vi.setSystemTime(new Date('2026-09-30T14:05:00.000Z'));
				await operations.archive(ctx, 'p-1');
				expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual({
					...original,
					archived_at: firstArchive
				});
				for (const [table, id] of [
					['personnel_follow_ups', 'follow-up-open'],
					['counseling_records', 'counseling-active'],
					['personnel_documents', 'document-active'],
					['leader_notes', 'note-active']
				]) {
					expect(await ctx.store.findOne(table, ctx.auth.orgId, { id })).toMatchObject({ archived_at: firstArchive });
				}
				await operations.restore(ctx, 'p-1');
				expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual(original);
				for (const [table, id] of [
					['personnel_follow_ups', 'follow-up-open'],
					['counseling_records', 'counseling-active'],
					['personnel_documents', 'document-active'],
					['leader_notes', 'note-active']
				]) {
					expect(await ctx.store.findOne(table, ctx.auth.orgId, { id })).toMatchObject({ archived_at: null });
				}
				expect(await ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-open' })).toMatchObject(
					{ status: 'open' }
				);
				expect(
					await ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-completed' })
				).toMatchObject({ status: 'completed', archived_at: null });
				expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-independent' })).toMatchObject({
					archived_at: olderArchive
				});
			} finally {
				vi.useRealTimers();
			}
		}
	);

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
	});

	it('archives directly for a configure-capable member', async () => {
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
	});

	it.each([null, '2026-08-01T12:00:00.000Z'])(
		'denies out-of-scope archive and replay without effects (%s)',
		async (archivedAt) => {
			const ctx = buildContext({
				auth: {
					scopeSet: { kind: 'groups', groupIds: ['group-a'] }
				}
			});
			const { archive } = createPersonnelUseCases();
			seedPersonnel(ctx);
			await ctx.rawStore!.update('personnel', ctx.auth.orgId, 'p-1', { group_id: 'group-b', archived_at: archivedAt });
			const original = await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'p-1' });

			await expect(archive(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
			expect(await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual(original);
			expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.archived' }));
		}
	);
});

describe('Personnel — restore', () => {
	function seedArchivedPersonnel(ctx: ReturnType<typeof buildContext>, overrides: Record<string, unknown> = {}) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: '2026-04-01T00:00:00Z',
				organization_id: ctx.auth.orgId,
				...overrides
			}
		]);
	}

	function seedArchivedArtifacts(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				status: 'archived',
				archived_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'follow-up-still-archived',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				status: 'archived',
				archived_at: '2026-03-01T00:00:00Z'
			}
		]);
		ctx.store.seed('counseling_records', [
			{
				id: 'counseling-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'document-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				archived_at: '2026-04-01T00:00:00Z'
			},
			{ id: 'note-independent', organization_id: 'test-org', personnel_id: 'p-1', archived_at: '2026-03-01T00:00:00Z' },
			{
				id: 'note-other-person',
				organization_id: 'test-org',
				personnel_id: 'p-2',
				archived_at: '2026-04-01T00:00:00Z'
			},
			{ id: 'note-other-org', organization_id: 'other-org', personnel_id: 'p-1', archived_at: '2026-04-01T00:00:00Z' }
		]);
	}

	it('restores archived personnel, owned artifacts and audit state without a subscription provider', async () => {
		const ctx = buildContext();
		const { restore } = createPersonnelUseCases();
		seedArchivedPersonnel(ctx);
		seedArchivedArtifacts(ctx);

		const result = await restore(ctx, 'p-1');

		expect(result).toEqual({ success: true });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
		await expect(
			ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-restored' })
		).resolves.toMatchObject({
			status: 'open',
			archived_at: null
		});
		await expect(
			ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-still-archived' })
		).resolves.toMatchObject({ status: 'archived', archived_at: '2026-03-01T00:00:00Z' });
		await expect(
			ctx.store.findOne('counseling_records', ctx.auth.orgId, { id: 'counseling-restored' })
		).resolves.toMatchObject({ archived_at: null });
		await expect(
			ctx.store.findOne('personnel_documents', ctx.auth.orgId, { id: 'document-restored' })
		).resolves.toMatchObject({ archived_at: null });
		await expect(ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-restored' })).resolves.toMatchObject({
			archived_at: null
		});
		await expect(ctx.store.findOne('leader_notes', 'test-org', { id: 'note-independent' })).resolves.toMatchObject({
			archived_at: '2026-03-01T00:00:00Z'
		});
		await expect(ctx.store.findOne('leader_notes', 'test-org', { id: 'note-other-person' })).resolves.toMatchObject({
			archived_at: '2026-04-01T00:00:00Z'
		});
		await expect(ctx.store.findOne('leader_notes', 'other-org', { id: 'note-other-org' })).resolves.toMatchObject({
			archived_at: '2026-04-01T00:00:00Z'
		});
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.restored',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: { name: 'SGT Smith, Jamie' }
			})
		);
	});

	it('rejects restore when the personnel record is missing', async () => {
		const ctx = buildContext();
		const { restore } = createPersonnelUseCases();

		await expect(restore(ctx, 'p-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('rejects restore when the personnel record is not archived', async () => {
		const ctx = buildContext();
		const { restore } = createPersonnelUseCases();
		seedArchivedPersonnel(ctx, { archived_at: null });

		await expect(restore(ctx, 'p-1')).rejects.toMatchObject({ status: 400 });
	});

	it('authorizes restore before returning archive-state errors', async () => {
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
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { restore } = createPersonnelUseCases();
		seedArchivedPersonnel(ctx, { archived_at: null, group_id: 'group-b' });

		await expect(restore(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.restoreRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});

	it('enforces group scope using the archived personnel row group', async () => {
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
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { restore } = createPersonnelUseCases();
		seedArchivedPersonnel(ctx, { group_id: 'group-b' });

		await expect(restore(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.restoreRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});

describe('Personnel — permanent delete', () => {
	function seedPersonnel(ctx: ReturnType<typeof createTestContext>, overrides: Record<string, unknown> = {}) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: '2026-04-01T00:00:00Z',
				organization_id: ctx.auth.orgId,
				...overrides
			}
		]);
	}

	it('deletes archived personnel, audits, and notifies admins', async () => {
		const ctx = createTestContext();
		const { permanentlyDelete } = createPersonnelUseCases();
		seedPersonnel(ctx);

		const result = await permanentlyDelete(ctx, 'p-1');

		expect(result).toEqual({ success: true });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toBeNull();
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.permanently_deleted',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: { name: 'SGT Smith, Jamie' }
			})
		);
		expect(ctx.notificationPort.notifications).toContainEqual({
			target: 'admins',
			orgId: ctx.auth.orgId,
			excludeUserId: ctx.auth.userId,
			notification: {
				type: 'personnel_permanently_deleted',
				title: 'Personnel Permanently Deleted',
				message: 'Personnel "SGT Smith, Jamie" was permanently deleted.'
			}
		});
	});

	it('rejects permanent delete when id is missing', async () => {
		const ctx = createTestContext();
		const { permanentlyDelete } = createPersonnelUseCases();

		await expect(permanentlyDelete(ctx, '')).rejects.toMatchObject({ status: 400 });
	});

	it('rejects permanent delete when the personnel record is missing', async () => {
		const ctx = createTestContext();
		const { permanentlyDelete } = createPersonnelUseCases();

		await expect(permanentlyDelete(ctx, 'p-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('rejects permanent delete for active personnel', async () => {
		const ctx = createTestContext();
		const { permanentlyDelete } = createPersonnelUseCases();
		seedPersonnel(ctx, { archived_at: null });

		await expect(permanentlyDelete(ctx, 'p-1')).rejects.toMatchObject({ status: 400 });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
	});

	it('authorizes permanent delete before returning archive-state errors', async () => {
		const ctx = createTestContext({
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
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { permanentlyDelete } = createPersonnelUseCases();
		seedPersonnel(ctx, { archived_at: null, group_id: 'group-b' });

		await expect(permanentlyDelete(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
		expect(ctx.notificationPort.notifications).toHaveLength(0);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.permanentlyDeleteRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});

	it('enforces group scope using the archived personnel row group', async () => {
		const ctx = createTestContext({
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
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		const { permanentlyDelete } = createPersonnelUseCases();
		seedPersonnel(ctx, { group_id: 'group-b' });

		await expect(permanentlyDelete(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: '2026-04-01T00:00:00Z'
		});
		expect(ctx.notificationPort.notifications).toHaveLength(0);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.permanentlyDeleteRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
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

	it('retains an already-archived event while archiving the active candidate in a mixed batch', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);
		const archivedAt = '2026-08-01T12:00:00.000Z';
		await ctx.store.update('personnel', ctx.auth.orgId, 'p-2', { archived_at: archivedAt });
		const original = await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-2' });
		const result = await createPersonnelUseCases().archiveBatch(ctx, {
			ids: ['p-1', 'p-2', 'missing'],
			userEmail: 'requester@example.com'
		});
		expect(result).toEqual({
			archivedIds: ['p-1'],
			approvalRequestedIds: [],
			errors: [
				{ id: 'p-2', message: 'Personnel is already archived' },
				{ id: 'missing', message: 'Personnel not found' }
			]
		});
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-2' })).toEqual(original);
		expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-p2' })).toMatchObject({
			archived_at: null
		});
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toMatchObject({
			archived_at: expect.any(String)
		});
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
		seedPersonnelArtifacts(ctx);

		const result = await archiveBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		expect(result).toEqual({
			archivedIds: [],
			approvalRequestedIds: ['p-1', 'p-2'],
			errors: []
		});
		await expect(ctx.store.findMany('leader_notes', 'test-org')).resolves.toEqual([
			expect.objectContaining({ id: 'note-p1', archived_at: null }),
			expect.objectContaining({ id: 'note-p2', archived_at: null })
		]);
		const requests = (await ctx.store.findMany('deletion_requests', 'test-org')) as Record<string, unknown>[];
		expect(requests).toHaveLength(2);
		expect(requests).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-1', status: 'pending' }),
				expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-2', status: 'pending' })
			])
		);
	});
});

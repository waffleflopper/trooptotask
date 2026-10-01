import { describe, it, expect } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createRatingSchemeEntryUseCases } from './ratingSchemeEntryCrud';

function buildContext(overrides?: Parameters<typeof createTestContext>[0]) {
	return createTestContext(overrides);
}

function seedRatedPerson(ctx: ReturnType<typeof buildContext>, groupId: string | null = null) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			group_id: groupId
		}
	]);
}

const validInput = {
	ratedPersonId: 'person-1',
	evalType: 'OER',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-06-30',
	status: 'active'
};

describe('Rating scheme entry — create', () => {
	it('uses Rating Scheme policy decisions instead of the legacy edit lane before mutating', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
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
		seedRatedPerson(ctx);
		const { create } = createRatingSchemeEntryUseCases();

		const result = (await create(ctx, { ...validInput })) as Record<string, unknown>;

		expect(result).toMatchObject({
			ratedPersonId: 'person-1',
			evalType: 'OER',
			status: 'active'
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
		seedRatedPerson(ctx);
		const { create } = createRatingSchemeEntryUseCases();

		await create(ctx, { ...validInput, raterName: '', seniorRaterName: '' });

		const stored = (await ctx.store.findMany('rating_scheme_entries', 'test-org')) as Record<string, unknown>[];
		expect(stored[0].rater_name).toBeNull();
		expect(stored[0].senior_rater_name).toBeNull();
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

	it('denies a Group member write for an unassigned rated Person', async () => {
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

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ reasonCode: 'denied:out-of-scope' })
			})
		);
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
		seedRatedPerson(ctx);
		const { update } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-06-30',
				status: 'active',
				organization_id: 'test-org'
			}
		]);

		const result = (await update(ctx, { id: 'rs-1', status: 'completed' })) as Record<string, unknown>;
		expect(result.status).toBe('completed');

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.updated',
			resourceId: 'rs-1'
		});
	});

	it('coerces empty strings to null on update', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const { update } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-06-30',
				status: 'active',
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
		seedRatedPerson(ctx);
		const { remove } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'active',
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

	it('returns requiresApproval for non-governance members with Rating Scheme capability', async () => {
		const ctx = buildContext({
			auth: {
				isPrivileged: false,
				role: 'member',
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'configure'
				}
			}
		});
		seedRatedPerson(ctx);
		const { remove } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'active',
				organization_id: 'test-org'
			}
		]);

		const result = await remove(ctx, 'rs-1');
		expect(result).toMatchObject({ requiresApproval: true });

		// Entry should NOT be deleted
		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' });
		expect(stored).not.toBeNull();
	});

	it('does not allow configure-capable members to bypass delete approval for Rating Scheme entries', async () => {
		const ctx = buildContext({
			auth: {
				isPrivileged: false,
				role: 'member',
				capabilityMap: {
					calendar: 'configure',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});
		seedRatedPerson(ctx);
		const { remove } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'active',
				organization_id: 'test-org'
			}
		]);

		const result = await remove(ctx, 'rs-1');
		expect(result).toMatchObject({ requiresApproval: true });

		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' });
		expect(stored).not.toBeNull();
	});
});

const evaluatorFields = [
	['raterPersonId', 'rater_person_id'],
	['seniorRaterPersonId', 'senior_rater_person_id'],
	['intermediateRaterPersonId', 'intermediate_rater_person_id'],
	['reviewerPersonId', 'reviewer_person_id']
] as const;
const localEvaluator = 'd1600000-0000-4000-8000-00000000000a';
const foreignEvaluator = 'd1600000-0000-4000-8000-00000000000b';
const missingEvaluator = 'd1600000-0000-4000-8000-00000000000c';

function evaluatorContext() {
	const ctx = buildContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'groups', groupIds: ['alpha'] },
			capabilityMap: {
				ratingScheme: 'operate',
				personnel: 'none',
				calendar: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none'
			}
		}
	});
	ctx.store.seed('personnel', [
		{ id: 'person-1', organization_id: 'test-org', group_id: 'alpha' },
		{ id: localEvaluator, organization_id: 'test-org', group_id: 'bravo', archived_at: '2026-01-01' },
		{ id: foreignEvaluator, organization_id: 'foreign-org', group_id: 'alpha' }
	]);
	ctx.store.seed('rating_scheme_entries', [
		{
			id: 'rs-1',
			organization_id: 'test-org',
			rated_person_id: 'person-1',
			eval_type: 'OER',
			rating_period_start: '2026-01-01',
			rating_period_end: '2026-06-30',
			status: 'active',
			notes: 'Retained note',
			rater_person_id: null,
			senior_rater_person_id: null,
			intermediate_rater_person_id: null,
			reviewer_person_id: null
		}
	]);
	return ctx;
}

describe('Rating Scheme evaluator integrity', () => {
	it.each(evaluatorFields)(
		'rejects foreign/missing %s on create and update without mutation or success audit',
		async (field) => {
			const ctx = evaluatorContext();
			const cases = createRatingSchemeEntryUseCases();
			const before = structuredClone(await ctx.rawStore.findMany('rating_scheme_entries', 'test-org'));
			for (const id of [foreignEvaluator, missingEvaluator, 'not-a-person-id']) {
				await expect(cases.create(ctx, { ...validInput, [field]: id })).rejects.toMatchObject({ status: 400 });
				await expect(cases.update(ctx, { id: 'rs-1', [field]: id, notes: 'Must not persist' })).rejects.toMatchObject({
					status: 400
				});
			}
			expect(await ctx.rawStore.findMany('rating_scheme_entries', 'test-org')).toEqual(before);
			expect(ctx.auditPort.events).toEqual([]);
		}
	);

	it.each(evaluatorFields)('allows local archived cross-Group %s, then explicit clearing', async (field, column) => {
		const ctx = evaluatorContext();
		const cases = createRatingSchemeEntryUseCases();
		await cases.create(ctx, { ...validInput, [field]: localEvaluator.toUpperCase() });
		await cases.update(ctx, { id: 'rs-1', [field]: localEvaluator });
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' })).toMatchObject({
			[column]: localEvaluator
		});
		await cases.update(ctx, { id: 'rs-1', [field]: '' });
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' })).toMatchObject({
			[column]: null
		});
	});

	it('preserves resubmitted historical foreign relationships during unrelated edits', async () => {
		const ctx = evaluatorContext();
		await ctx.rawStore.update('rating_scheme_entries', 'test-org', 'rs-1', {
			rater_person_id: foreignEvaluator,
			senior_rater_person_id: foreignEvaluator,
			intermediate_rater_person_id: foreignEvaluator,
			reviewer_person_id: foreignEvaluator,
			rater_name: 'Historical external name'
		});
		await createRatingSchemeEntryUseCases().update(ctx, {
			id: 'rs-1',
			raterPersonId: foreignEvaluator.toUpperCase(),
			seniorRaterPersonId: foreignEvaluator,
			intermediateRaterPersonId: foreignEvaluator,
			reviewerPersonId: foreignEvaluator,
			notes: 'Unrelated historical edit'
		});
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' })).toMatchObject({
			rater_person_id: foreignEvaluator.toUpperCase(),
			senior_rater_person_id: foreignEvaluator,
			intermediate_rater_person_id: foreignEvaluator,
			reviewer_person_id: foreignEvaluator,
			rater_name: 'Historical external name',
			notes: 'Unrelated historical edit'
		});
	});

	it('does not mutate when evaluator validation is unavailable', async () => {
		const ctx = evaluatorContext();
		ctx.personnelRatingSchemeRoster!.hasEvaluatorReferences = async () => {
			throw new Error('Synthetic provider failure');
		};
		const before = structuredClone(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' }));
		await expect(
			createRatingSchemeEntryUseCases().update(ctx, { id: 'rs-1', raterPersonId: localEvaluator })
		).rejects.toThrow('Synthetic provider failure');
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' })).toEqual(before);
		expect(ctx.auditPort.events).toEqual([]);
	});
});

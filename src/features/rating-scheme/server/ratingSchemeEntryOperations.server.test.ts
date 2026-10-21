import { describe, it, expect, vi } from 'vitest';
import { createTestContext } from './ratingSchemePersistence.test-support.server';
import {
	createRatingSchemeEntry,
	updateRatingSchemeEntry,
	removeRatingSchemeEntry
} from './ratingSchemeEntryOperations.server';

const RATED_PERSON = '00000000-0000-4000-8000-0000000000a1';
const ENTRY = '00000000-0000-4000-8000-0000000000e1';
const FOREIGN_ENTRY = '00000000-0000-4000-8000-0000000000f1';

function buildContext(overrides?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(overrides);
	return {
		...ctx,
		notifyRatingSchemeEntryDeleted: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
	};
}

function seedRatedPerson(ctx: ReturnType<typeof buildContext>, groupId: string | null = null) {
	ctx.store.seed('personnel', [
		{
			id: RATED_PERSON,
			organization_id: ctx.auth.orgId,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			group_id: groupId
		}
	]);
}

const validInput = {
	ratedPersonId: RATED_PERSON,
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
				id: RATED_PERSON,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);
		const create = createRatingSchemeEntry;

		await create(ctx, { ...validInput });

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.created',
			resourceType: 'rating_scheme'
		});
	});

	it('creates an entry, persists it, and audits', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const create = createRatingSchemeEntry;

		const result = await create(ctx, { ...validInput });

		expect(result).toMatchObject({
			ratedPersonId: RATED_PERSON,
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
		const create = createRatingSchemeEntry;

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
		const create = createRatingSchemeEntry;

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
				id: RATED_PERSON,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: 'group-c'
			}
		]);
		const create = createRatingSchemeEntry;

		const result = await create(ctx, { ...validInput });

		expect(result.ratedPersonId).toBe(RATED_PERSON);
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
				id: RATED_PERSON,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);
		const create = createRatingSchemeEntry;

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
				id: RATED_PERSON,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: 'group-b'
			}
		]);
		const create = createRatingSchemeEntry;

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
		const update = updateRatingSchemeEntry;

		ctx.store.seed('rating_scheme_entries', [
			{
				id: ENTRY,
				rated_person_id: RATED_PERSON,
				eval_type: 'OER',
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-06-30',
				status: 'active',
				organization_id: 'test-org'
			}
		]);

		const result = await update(ctx, { id: ENTRY, status: 'completed' });
		expect(result.status).toBe('completed');

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.updated',
			resourceId: ENTRY
		});
	});

	it('coerces empty strings to null on update', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const update = updateRatingSchemeEntry;

		ctx.store.seed('rating_scheme_entries', [
			{
				id: ENTRY,
				rated_person_id: RATED_PERSON,
				eval_type: 'OER',
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-06-30',
				status: 'active',
				rater_name: 'Old Rater',
				organization_id: 'test-org'
			}
		]);

		await update(ctx, { id: ENTRY, raterName: '' });

		const stored = (await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: ENTRY })) as Record<
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
		const remove = removeRatingSchemeEntry;

		ctx.store.seed('rating_scheme_entries', [
			{
				id: ENTRY,
				rated_person_id: RATED_PERSON,
				eval_type: 'OER',
				status: 'active',
				organization_id: 'test-org'
			}
		]);
		await remove(ctx, ENTRY);

		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: ENTRY });
		expect(stored).toBeNull();

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.deleted',
			resourceId: ENTRY
		});

		expect(ctx.notifyRatingSchemeEntryDeleted).toHaveBeenCalledOnce();
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
		const remove = removeRatingSchemeEntry;

		ctx.store.seed('rating_scheme_entries', [
			{
				id: ENTRY,
				rated_person_id: RATED_PERSON,
				eval_type: 'OER',
				status: 'active',
				organization_id: 'test-org'
			}
		]);

		const result = await remove(ctx, ENTRY);
		expect(result).toMatchObject({ requiresApproval: true });

		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: ENTRY });
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
		const remove = removeRatingSchemeEntry;

		ctx.store.seed('rating_scheme_entries', [
			{
				id: ENTRY,
				rated_person_id: RATED_PERSON,
				eval_type: 'OER',
				status: 'active',
				organization_id: 'test-org'
			}
		]);

		const result = await remove(ctx, ENTRY);
		expect(result).toMatchObject({ requiresApproval: true });

		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: ENTRY });
		expect(stored).not.toBeNull();
	});

	it('preserves the entry and skips success effects when deletion fails', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const entry = await createRatingSchemeEntry(ctx, validInput);
		const before = structuredClone(await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: entry.id }));
		vi.spyOn(ctx.rawStore, 'deleteWhere').mockRejectedValueOnce(new Error('Synthetic deletion failure'));

		await expect(removeRatingSchemeEntry(ctx, entry.id)).rejects.toThrow('Synthetic deletion failure');
		expect(await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: entry.id })).toEqual(before);
		expect(ctx.auditPort.events.map((event) => event.action)).toEqual(['rating_scheme.created']);
		expect(ctx.notifyRatingSchemeEntryDeleted).not.toHaveBeenCalled();
	});

	it('awaits the delivery notification after successful deletion and audit', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const entry = await createRatingSchemeEntry(ctx, validInput);
		let releaseNotification!: () => void;
		let notificationStarted!: () => void;
		const pendingNotification = new Promise<void>((resolve) => {
			releaseNotification = resolve;
		});
		const started = new Promise<void>((resolve) => {
			notificationStarted = resolve;
		});
		ctx.notifyRatingSchemeEntryDeleted.mockImplementation(() => {
			notificationStarted();
			return pendingNotification;
		});
		let settled = false;
		const removal = removeRatingSchemeEntry(ctx, entry.id).then(() => {
			settled = true;
		});
		await started;

		expect(await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: entry.id })).toBeNull();
		expect(ctx.auditPort.events.map((event) => event.action)).toEqual([
			'rating_scheme.created',
			'rating_scheme.deleted'
		]);
		expect(settled).toBe(false);
		releaseNotification();
		await removal;
		expect(settled).toBe(true);
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
		{ id: RATED_PERSON, organization_id: 'test-org', group_id: 'alpha' },
		{ id: localEvaluator, organization_id: 'test-org', group_id: 'bravo', archived_at: '2026-01-01' },
		{ id: foreignEvaluator, organization_id: 'foreign-org', group_id: 'alpha' }
	]);
	ctx.store.seed('rating_scheme_entries', [
		{
			id: ENTRY,
			organization_id: 'test-org',
			rated_person_id: RATED_PERSON,
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
			const cases = { create: createRatingSchemeEntry, update: updateRatingSchemeEntry };
			const before = structuredClone(await ctx.rawStore.findMany('rating_scheme_entries', 'test-org'));
			for (const id of [foreignEvaluator, missingEvaluator, 'not-a-person-id']) {
				await expect(cases.create(ctx, { ...validInput, [field]: id })).rejects.toMatchObject({ status: 400 });
				await expect(cases.update(ctx, { id: ENTRY, [field]: id, notes: 'Must not persist' })).rejects.toMatchObject({
					status: 400
				});
			}
			expect(await ctx.rawStore.findMany('rating_scheme_entries', 'test-org')).toEqual(before);
			expect(ctx.auditPort.events).toEqual([]);
		}
	);

	it.each(evaluatorFields)('allows local archived cross-Group %s, then explicit clearing', async (field, column) => {
		const ctx = evaluatorContext();
		const cases = { create: createRatingSchemeEntry, update: updateRatingSchemeEntry };
		await cases.create(ctx, { ...validInput, [field]: localEvaluator.toUpperCase() });
		await cases.update(ctx, { id: ENTRY, [field]: localEvaluator });
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: ENTRY })).toMatchObject({
			[column]: localEvaluator
		});
		await cases.update(ctx, { id: ENTRY, [field]: '' });
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: ENTRY })).toMatchObject({
			[column]: null
		});
	});

	it('preserves resubmitted historical foreign relationships during unrelated edits', async () => {
		const ctx = evaluatorContext();
		await ctx.rawStore.update('rating_scheme_entries', 'test-org', ENTRY, {
			rater_person_id: foreignEvaluator,
			senior_rater_person_id: foreignEvaluator,
			intermediate_rater_person_id: foreignEvaluator,
			reviewer_person_id: foreignEvaluator,
			rater_name: 'Historical external name'
		});
		await updateRatingSchemeEntry(ctx, {
			id: ENTRY,
			raterPersonId: foreignEvaluator.toUpperCase(),
			seniorRaterPersonId: foreignEvaluator,
			intermediateRaterPersonId: foreignEvaluator,
			reviewerPersonId: foreignEvaluator,
			notes: 'Unrelated historical edit'
		});
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: ENTRY })).toMatchObject({
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
		const before = structuredClone(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: ENTRY }));
		await expect(updateRatingSchemeEntry(ctx, { id: ENTRY, raterPersonId: localEvaluator })).rejects.toThrow(
			'Synthetic provider failure'
		);
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: ENTRY })).toEqual(before);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('rejects retargeting an accessible evaluation to a Person outside the rated Group scope', async () => {
		const ctx = evaluatorContext();
		const before = structuredClone(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: ENTRY }));

		await expect(
			updateRatingSchemeEntry(ctx, {
				id: ENTRY,
				ratedPersonId: localEvaluator,
				notes: 'Must not persist'
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.rawStore.findOne('rating_scheme_entries', 'test-org', { id: ENTRY })).toEqual(before);
		expect(ctx.auditPort.events.map((event) => event.action)).toEqual(['policy.denied']);
	});

	it('hides foreign entries from updates and deletions without success effects', async () => {
		const ctx = evaluatorContext();
		ctx.store.seed('rating_scheme_entries', [
			{
				id: FOREIGN_ENTRY,
				organization_id: 'foreign-org',
				rated_person_id: foreignEvaluator,
				eval_type: 'OER',
				status: 'active',
				notes: 'Foreign retained note'
			}
		]);
		const before = structuredClone(await ctx.rawStore.findMany('rating_scheme_entries', 'foreign-org'));

		await expect(updateRatingSchemeEntry(ctx, { id: FOREIGN_ENTRY, notes: 'Must not persist' })).rejects.toMatchObject({
			status: 404
		});
		await expect(removeRatingSchemeEntry(ctx, FOREIGN_ENTRY)).rejects.toMatchObject({ status: 404 });
		expect(await ctx.rawStore.findMany('rating_scheme_entries', 'foreign-org')).toEqual(before);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notifyRatingSchemeEntryDeleted).not.toHaveBeenCalled();
	});
});

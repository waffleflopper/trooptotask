import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, it, expect, vi } from 'vitest';
import { createTestContext } from './ratingSchemePersistence.test-support.server';
import {
	changeRatingSchemeRater,
	createRatingSchemeEntry,
	removeRatingSchemeEntry,
	setRatingSchemeEntryArchived,
	transitionRatingSchemeEntry,
	updateRatingSchemeEntry
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
	ratingPeriodEnd: '2026-06-30'
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
	});

	it('creates an entry and persists it', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const create = createRatingSchemeEntry;

		const result = await create(ctx, { ...validInput });

		expect(result).toMatchObject({
			ratedPersonId: RATED_PERSON,
			evalType: 'OER'
		});

		const stored = await ctx.store.findMany('rating_scheme_entries', 'test-org');
		expect(stored).toHaveLength(1);
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
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a', 'group-c'] })
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
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a'] })
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
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a', 'group-c'] })
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
	it('updates an entry', async () => {
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
				organization_id: 'test-org'
			}
		]);

		const result = await update(ctx, { id: ENTRY, notes: 'Counseling scheduled' });
		expect(result.notes).toBe('Counseling scheduled');
	});

	it('refuses an edit that carries a workflow step and keeps the stored step', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(
			updateRatingSchemeEntry(ctx, { id: ENTRY, notes: 'n', workflowStatus: 'completed' })
		).rejects.toMatchObject({ status: 400 });
		const stored = await ctx.store.findOne<Record<string, unknown>>('rating_scheme_entries', ctx.auth.orgId, {
			id: ENTRY
		});
		expect(stored).toMatchObject({ workflow_status: null, notes: 'Keep with the closed report' });
	});

	it('refuses an edit that carries an archive time and keeps the entry listed', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(updateRatingSchemeEntry(ctx, { id: ENTRY, archivedAt: '2026-05-01T00:00:00Z' })).rejects.toMatchObject(
			{ status: 400 }
		);
		await expect(
			createRatingSchemeEntry(ctx, { ...validInput, archivedAt: '2026-05-01T00:00:00Z' })
		).rejects.toMatchObject({ status: 400 });
		const stored = await ctx.store.findOne<Record<string, unknown>>('rating_scheme_entries', ctx.auth.orgId, {
			id: ENTRY
		});
		expect(stored?.archived_at ?? null).toBeNull();
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(1);
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

function seedEntry(ctx: ReturnType<typeof buildContext>, values: Record<string, unknown> = {}) {
	ctx.store.seed('rating_scheme_entries', [
		{
			id: ENTRY,
			organization_id: ctx.auth.orgId,
			rated_person_id: RATED_PERSON,
			eval_type: 'NCOER',
			rater_person_id: null,
			rater_name: 'SSG Current',
			senior_rater_person_id: null,
			senior_rater_name: 'MSG Senior',
			intermediate_rater_person_id: null,
			intermediate_rater_name: null,
			reviewer_person_id: null,
			reviewer_name: null,
			rating_period_start: '2026-01-01',
			rating_period_end: '2026-12-31',
			notes: 'Keep with the closed report',
			report_type: 'AN',
			workflow_status: null,
			...values
		}
	]);
}

const viewOnly = {
	auth: {
		role: 'member' as const,
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none' as const,
			personnel: 'none' as const,
			training: 'none' as const,
			criticalTasks: 'none' as const,
			onboarding: 'none' as const,
			ratingScheme: 'view' as const
		}
	}
};

describe('Rating scheme entry — workflow', () => {
	it('moves forward past an absent intermediate rater and back again', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'rater-signed' });

		const forward = await transitionRatingSchemeEntry(ctx, ENTRY, { from: 'rater-signed', to: 'with-senior-rater' });
		expect(forward).toMatchObject({ moved: true, entry: { workflowStatus: 'with-senior-rater' } });
		const back = await transitionRatingSchemeEntry(ctx, ENTRY, { from: 'with-senior-rater', to: 'rater-signed' });
		expect(back).toMatchObject({ moved: true, entry: { workflowStatus: 'rater-signed' } });
	});

	it('jumps back several steps at once and into Command Review', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'sm-signed' });

		const back = await transitionRatingSchemeEntry(ctx, ENTRY, { from: 'sm-signed', to: 'drafting' });
		expect(back).toMatchObject({ moved: true, entry: { workflowStatus: 'drafting' } });
		const review = await transitionRatingSchemeEntry(ctx, ENTRY, { from: 'drafting', to: 'command-review' });
		expect(review).toMatchObject({ moved: true, entry: { workflowStatus: 'command-review' } });
	});

	it('refuses a jump to a reviewer step the entry has no reviewer for', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'sr-signed' });

		await expect(
			transitionRatingSchemeEntry(ctx, ENTRY, { from: 'sr-signed', to: 'with-reviewer' })
		).rejects.toMatchObject({ status: 409 });
		const stored = await ctx.store.findOne<Record<string, unknown>>('rating_scheme_entries', ctx.auth.orgId, {
			id: ENTRY
		});
		expect(stored?.workflow_status).toBe('sr-signed');
	});

	it('jumps to a reviewer step when the entry has a reviewer', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'drafting', reviewer_name: 'COL Reviewer' });

		await expect(
			transitionRatingSchemeEntry(ctx, ENTRY, { from: 'drafting', to: 'reviewer-signed' })
		).resolves.toMatchObject({ moved: true, entry: { workflowStatus: 'reviewer-signed' } });
	});

	it('stops tracking only from drafting or completed', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'with-rater' });

		await expect(transitionRatingSchemeEntry(ctx, ENTRY, { from: 'with-rater', to: null })).rejects.toMatchObject({
			status: 409
		});
		const stored = await ctx.store.findOne<Record<string, unknown>>('rating_scheme_entries', ctx.auth.orgId, {
			id: ENTRY
		});
		expect(stored?.workflow_status).toBe('with-rater');
	});

	it('answers a repeated move to the current step without moving it again', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'completed' });

		await expect(
			transitionRatingSchemeEntry(ctx, ENTRY, { from: 'completed', to: 'completed' })
		).resolves.toMatchObject({
			moved: false,
			entry: { workflowStatus: 'completed' }
		});
	});

	it('rejects an unknown step before reading the evaluation', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(transitionRatingSchemeEntry(ctx, ENTRY, { from: null, to: 'active' })).rejects.toMatchObject({
			status: 400
		});
	});

	it('denies a move without Rating Scheme operate access', async () => {
		const ctx = buildContext(viewOnly);
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(transitionRatingSchemeEntry(ctx, ENTRY, { from: null, to: 'drafting' })).rejects.toMatchObject({
			status: 403
		});
		const stored = await ctx.store.findOne<Record<string, unknown>>('rating_scheme_entries', ctx.auth.orgId, {
			id: ENTRY
		});
		expect(stored?.workflow_status).toBeNull();
	});

	it('answers 404 for an evaluation outside the Organization', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);

		await expect(transitionRatingSchemeEntry(ctx, FOREIGN_ENTRY, { from: null, to: 'drafting' })).rejects.toMatchObject(
			{
				status: 404
			}
		);
	});
});

describe('Rating scheme entry — change of rater', () => {
	it('completes the current evaluation and opens the next one for the new rater', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'with-rater' });

		const result = await changeRatingSchemeRater(ctx, ENTRY, { changeDate: '2026-06-30', raterName: 'SSG New' });

		expect(result.entry).toMatchObject({
			ratingPeriodEnd: '2026-06-30',
			reportType: 'CR',
			workflowStatus: 'completed',
			raterName: 'SSG Current',
			notes: 'Keep with the closed report'
		});
		expect(result.successor).toMatchObject({
			ratedPersonId: RATED_PERSON,
			evalType: 'NCOER',
			raterName: 'SSG New',
			raterPersonId: null,
			seniorRaterName: 'MSG Senior',
			ratingPeriodStart: '2026-07-01',
			ratingPeriodEnd: '2027-06-30',
			reportType: 'AN',
			workflowStatus: null,
			notes: null
		});
	});

	it('takes the closed evaluation off the rating scheme and lists the successor', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'with-rater' });

		const result = await changeRatingSchemeRater(ctx, ENTRY, { changeDate: '2026-06-30', raterName: 'SSG New' });

		expect(result.entry.archivedAt).toEqual(expect.any(String));
		expect(result.successor?.archivedAt).toBeNull();
	});

	it('refuses to change the rater of an open evaluation taken off the rating scheme', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'with-rater', archived_at: '2026-05-01T00:00:00.000Z' });

		await expect(
			changeRatingSchemeRater(ctx, ENTRY, { changeDate: '2026-06-30', raterName: 'SSG New' })
		).rejects.toMatchObject({ status: 409 });
		const stored = await ctx.store.findMany<{ workflow_status: string | null; report_type: string | null }>(
			'rating_scheme_entries',
			ctx.auth.orgId
		);
		expect(stored.map((row) => [row.workflow_status, row.report_type])).toEqual([['with-rater', 'AN']]);
	});

	it('returns the successor it opened when the change is sent again, and opens no second one', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx);
		const change = { changeDate: '2026-06-30', raterName: 'SSG New' };

		const first = await changeRatingSchemeRater(ctx, ENTRY, change);
		const repeated = await changeRatingSchemeRater(ctx, ENTRY, { changeDate: '2026-06-30', raterName: ' ssg new ' });
		const different = await changeRatingSchemeRater(ctx, ENTRY, { changeDate: '2026-06-30', raterName: 'SSG Other' });

		expect(repeated.successor).toEqual(first.successor);
		expect(repeated.successor).toMatchObject({ raterName: 'SSG New', ratingPeriodStart: '2026-07-01' });
		expect(different.successor).toBeNull();
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(2);
	});

	it('refuses a change date outside the rating period and changes nothing', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(
			changeRatingSchemeRater(ctx, ENTRY, { changeDate: '2027-01-01', raterName: 'SSG New' })
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(1);
	});

	it('requires a new rater who belongs to the Organization', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(
			changeRatingSchemeRater(ctx, ENTRY, { changeDate: '2026-06-30', raterPersonId: FOREIGN_ENTRY })
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(1);
	});

	it('denies a change of rater without Rating Scheme operate access', async () => {
		const ctx = buildContext(viewOnly);
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(
			changeRatingSchemeRater(ctx, ENTRY, { changeDate: '2026-06-30', raterName: 'SSG New' })
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(1);
	});
});

describe('Rating scheme entry — archive', () => {
	it('archives and restores whatever step the evaluation has reached', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { workflow_status: 'completed' });

		const archived = await setRatingSchemeEntryArchived(ctx, ENTRY, { archived: true });
		const restored = await setRatingSchemeEntryArchived(ctx, ENTRY, { archived: false });

		expect(archived).toMatchObject({ changed: true, entry: { workflowStatus: 'completed' } });
		expect(archived.entry.archivedAt).toEqual(expect.any(String));
		expect(restored).toMatchObject({ changed: true, entry: { workflowStatus: 'completed', archivedAt: null } });
	});

	it('answers a repeated request without changing the entry again', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx);

		const first = await setRatingSchemeEntryArchived(ctx, ENTRY, { archived: true });
		const repeated = await setRatingSchemeEntryArchived(ctx, ENTRY, { archived: true });
		const listed = await setRatingSchemeEntryArchived(ctx, FOREIGN_ENTRY, { archived: false }).catch((error) => error);

		expect(repeated).toEqual({ changed: false, entry: first.entry });
		expect(listed).toMatchObject({ status: 404 });
	});

	it('keeps an archived entry editable and its step movable', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx, { archived_at: '2026-05-01T00:00:00.000Z' });

		const edited = await updateRatingSchemeEntry(ctx, { id: ENTRY, notes: 'Still tracked' });
		const moved = await transitionRatingSchemeEntry(ctx, ENTRY, { from: null, to: 'drafting' });

		expect(edited).toMatchObject({ notes: 'Still tracked', archivedAt: '2026-05-01T00:00:00.000Z' });
		expect(moved.entry).toMatchObject({ workflowStatus: 'drafting', archivedAt: '2026-05-01T00:00:00.000Z' });
	});

	it('refuses a body that does not say whether to archive or restore', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(setRatingSchemeEntryArchived(ctx, ENTRY, {})).rejects.toMatchObject({ status: 400 });
		await expect(setRatingSchemeEntryArchived(ctx, ENTRY, { archived: 'yes' })).rejects.toMatchObject({ status: 400 });
	});

	it('denies archiving without Rating Scheme operate access', async () => {
		const ctx = buildContext(viewOnly);
		seedRatedPerson(ctx);
		seedEntry(ctx);

		await expect(setRatingSchemeEntryArchived(ctx, ENTRY, { archived: true })).rejects.toMatchObject({ status: 403 });
		const stored = await ctx.store.findOne<Record<string, unknown>>('rating_scheme_entries', ctx.auth.orgId, {
			id: ENTRY
		});
		expect(stored?.archived_at ?? null).toBeNull();
	});
});

describe('Rating scheme entry — delete', () => {
	it('deletes entry and notifies admins', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const remove = removeRatingSchemeEntry;

		ctx.store.seed('rating_scheme_entries', [
			{
				id: ENTRY,
				rated_person_id: RATED_PERSON,
				eval_type: 'OER',
				organization_id: 'test-org'
			}
		]);
		await remove(ctx, ENTRY);

		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: ENTRY });
		expect(stored).toBeNull();

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
		expect(ctx.notifyRatingSchemeEntryDeleted).not.toHaveBeenCalled();
	});

	it('awaits the delivery notification after successful deletion', async () => {
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
			scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['alpha'] }),
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

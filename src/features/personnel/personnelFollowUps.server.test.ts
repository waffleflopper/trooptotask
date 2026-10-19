import { testPersonnelArtifactsContext } from './personnelArtifacts.testHelper';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	archivePersonnelFollowUp,
	createPersonnelFollowUp,
	listPersonnelFollowUps,
	restorePersonnelFollowUp,
	setPersonnelFollowUpStatus,
	updatePersonnelFollowUp
} from './personnelFollowUps.server';

const LEADER_USER_ID = '11111111-1111-4111-8111-111111111111';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>, groupId: string | null = null) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: groupId,
			rank: 'SGT',
			last_name: 'Rivera',
			first_name: 'Monica'
		}
	]);
}

describe('personnel follow-ups', () => {
	it('creates, lists, edits, completes, reopens, and archives dashboard follow-ups', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				userId: LEADER_USER_ID,
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);
		ctx.store.seed('organization_memberships', [
			{
				id: 'membership-1',
				organization_id: ctx.auth.orgId,
				user_id: LEADER_USER_ID,
				email: 'leader@example.com'
			}
		]);

		const created = await createPersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			title: 'Complete BLC packet',
			notes: 'Confirm signatures',
			dueDate: '2026-06-01'
		});
		const completed = await setPersonnelFollowUpStatus(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			followUpId: created.id,
			status: 'completed'
		});
		const reopened = await setPersonnelFollowUpStatus(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			followUpId: created.id,
			status: 'open'
		});
		const edited = await updatePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			followUpId: created.id,
			title: 'Complete BLC packet update',
			notes: 'Confirm signatures and dates',
			dueDate: '2026-06-15'
		});
		const archived = await archivePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			followUpId: created.id
		});
		const archivedStored = await ctx.store.findOne<Record<string, unknown>>('personnel_follow_ups', ctx.auth.orgId, {
			id: created.id
		});
		const archivedStoredAt = archivedStored?.archived_at;
		const restored = await restorePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			followUpId: created.id
		});
		const restoredStored = await ctx.store.findOne<Record<string, unknown>>('personnel_follow_ups', ctx.auth.orgId, {
			id: created.id
		});

		expect(created).toMatchObject({
			personnelId: 'person-1',
			title: 'Complete BLC packet',
			status: 'open',
			createdBy: 'leader@example.com'
		});
		expect(completed).toMatchObject({ status: 'completed', completedAt: expect.any(String) });
		expect(reopened).toMatchObject({ status: 'open', completedAt: null });
		expect(edited).toMatchObject({
			title: 'Complete BLC packet update',
			notes: 'Confirm signatures and dates',
			dueDate: '2026-06-15'
		});
		expect(archived.status).toBe('archived');
		expect(archived.archivedAt).toBeTruthy();
		expect(archivedStoredAt).toBe(archived.archivedAt);
		expect(restored.status).toBe('open');
		expect(restored.archivedAt).toBeNull();
		expect(restoredStored?.archived_at).toBeNull();
		await expect(
			listPersonnelFollowUps(testPersonnelArtifactsContext(ctx), 'person-1', undefined, { archived: true })
		).resolves.toHaveLength(0);
		const rearchived = await archivePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			followUpId: created.id
		});
		expect(rearchived.archivedAt).toBeTruthy();
		await expect(listPersonnelFollowUps(testPersonnelArtifactsContext(ctx), 'person-1')).resolves.toHaveLength(0);
		await expect(
			setPersonnelFollowUpStatus(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				followUpId: created.id,
				status: 'open'
			})
		).rejects.toMatchObject({ status: 409 });
		await expect(
			updatePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				followUpId: created.id,
				title: 'Should not update'
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it('names who completed a follow-up and puts a completed one back as completed after archive', async () => {
		const ctx = createTestContext({
			auth: { userId: LEADER_USER_ID, scopeSet: { kind: 'organization' } }
		});
		seedPersonnel(ctx);
		ctx.store.seed('organization_memberships', [
			{
				id: 'membership-1',
				organization_id: ctx.auth.orgId,
				user_id: LEADER_USER_ID,
				email: 'leader@example.com'
			}
		]);
		const context = testPersonnelArtifactsContext(ctx);
		const created = await createPersonnelFollowUp(context, { personnelId: 'person-1', title: 'Counsel on PT' });
		const ids = { personnelId: 'person-1', followUpId: created.id };

		const completed = await setPersonnelFollowUpStatus(context, { ...ids, status: 'completed' });
		expect(completed).toMatchObject({ status: 'completed', completedBy: 'leader@example.com' });

		const archived = await archivePersonnelFollowUp(context, ids);
		expect(archived).toMatchObject({ status: 'archived', archivedBy: 'leader@example.com' });
		const [listed] = await listPersonnelFollowUps(context, 'person-1', undefined, { archived: true });
		expect(listed).toMatchObject({ completedBy: 'leader@example.com', archivedBy: 'leader@example.com' });

		const restored = await restorePersonnelFollowUp(context, ids);
		expect(restored).toMatchObject({ status: 'completed', completedBy: 'leader@example.com', archivedBy: null });

		const reopened = await setPersonnelFollowUpStatus(context, { ...ids, status: 'open' });
		expect(reopened).toMatchObject({ status: 'open', completedAt: null, completedBy: null });
	});

	it('shows no name for a completer or archiver it cannot resolve instead of failing the read', async () => {
		const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
		const ctx = createTestContext({ auth: { userId: LEADER_USER_ID, scopeSet: { kind: 'organization' } } });
		seedPersonnel(ctx);
		ctx.store.seed('organization_memberships', [
			{ id: 'membership-1', organization_id: ctx.auth.orgId, user_id: LEADER_USER_ID, email: 'leader@example.com' }
		]);
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				title: 'Counsel on PT',
				notes: '',
				status: 'archived',
				created_by: LEADER_USER_ID,
				created_at: '2026-05-01T10:00:00Z',
				updated_at: '2026-05-01T10:00:00Z',
				completed_at: '2026-05-02T10:00:00Z',
				completed_by: OTHER_USER_ID,
				archived_at: '2026-05-03T10:00:00Z',
				archived_by: OTHER_USER_ID
			}
		]);
		const resolved = testPersonnelArtifactsContext(ctx);

		const [unknownMember] = await listPersonnelFollowUps(resolved, 'person-1', undefined, { archived: true });
		expect(unknownMember).toMatchObject({ createdBy: 'leader@example.com', completedBy: null, archivedBy: null });

		const failingLookup = {
			...resolved,
			contributorLabels: async (ids: string[]) => {
				if (ids.includes(OTHER_USER_ID)) throw new Error('label lookup failed');
				return resolved.contributorLabels(ids);
			}
		};
		const [lookupFailed] = await listPersonnelFollowUps(failingLookup, 'person-1', undefined, { archived: true });
		expect(lookupFailed).toMatchObject({ createdBy: 'leader@example.com', completedBy: null, archivedBy: null });
	});

	it('requires Personnel configure capability for reads and operate capability for writes', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);

		await expect(listPersonnelFollowUps(testPersonnelArtifactsContext(ctx), 'person-1')).rejects.toMatchObject({
			status: 403
		});
		await expect(
			createPersonnelFollowUp(testPersonnelArtifactsContext(ctx), { personnelId: 'person-1', title: 'Follow up' })
		).rejects.toMatchObject({
			status: 403
		});
		await expect(
			updatePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				followUpId: 'missing',
				title: 'Follow up'
			})
		).rejects.toMatchObject({ status: 403 });
		await expect(
			archivePersonnelFollowUp(testPersonnelArtifactsContext(ctx), { personnelId: 'person-1', followUpId: 'missing' })
		).rejects.toMatchObject({ status: 403 });
	});

	it('allows Personnel operate capability for follow-up writes but not sensitive reads', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);

		await expect(listPersonnelFollowUps(testPersonnelArtifactsContext(ctx), 'person-1')).rejects.toMatchObject({
			status: 403
		});

		const created = await createPersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			title: 'Follow up'
		});
		await expect(
			updatePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				followUpId: created.id,
				title: 'Updated follow up'
			})
		).resolves.toMatchObject({ title: 'Updated follow up' });
		await expect(
			archivePersonnelFollowUp(testPersonnelArtifactsContext(ctx), { personnelId: 'person-1', followUpId: created.id })
		).resolves.toMatchObject({
			status: 'archived'
		});
	});

	it('does not edit a follow-up through a different Person in the same Organization', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		ctx.store.seed('personnel', [{ id: 'person-2', organization_id: ctx.auth.orgId, group_id: null }]);
		const created = await createPersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			title: 'Keep this'
		});

		await expect(
			updatePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-2',
				followUpId: created.id,
				title: 'Wrong Person'
			})
		).rejects.toMatchObject({ status: 404 });
		const saved = await ctx.store.findOne<{ title: string }>('personnel_follow_ups', ctx.auth.orgId, {
			id: created.id
		});
		expect(saved?.title).toBe('Keep this');
	});

	it('delegates Soldier scope enforcement to the scope port', async () => {
		const requireGroupAccess = vi.fn(async () => {
			throw { status: 403, message: 'Group scope denied' };
		});
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-1'] }
			},
			scope: {
				requireGroupAccess
			}
		});
		seedPersonnel(ctx, 'group-1');

		await expect(listPersonnelFollowUps(testPersonnelArtifactsContext(ctx), 'person-1')).rejects.toMatchObject({
			status: 403
		});
		expect(requireGroupAccess).toHaveBeenCalledWith('person-1');
	});

	it('refreshes the follow-up archive event on repeated archive while requiring archived state to restore', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		const created = await createPersonnelFollowUp(context, { personnelId: 'person-1', title: 'Call' });
		await expect(
			restorePersonnelFollowUp(context, { personnelId: 'person-1', followUpId: created.id })
		).rejects.toMatchObject({ status: 409 });
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
			const first = await archivePersonnelFollowUp(context, { personnelId: 'person-1', followUpId: created.id });
			expect(first.archivedAt).toBe('2026-10-01T12:00:00.000Z');
			vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
			const repeated = await archivePersonnelFollowUp(context, { personnelId: 'person-1', followUpId: created.id });
			expect(repeated).toMatchObject({
				status: 'archived',
				archivedAt: '2026-10-02T12:00:00.000Z',
				updatedAt: '2026-10-02T12:00:00.000Z'
			});
			expect(ctx.auditPort.events.at(-1)).toMatchObject({ action: 'personnel.follow_up.archived' });
		} finally {
			vi.useRealTimers();
		}
	});
});

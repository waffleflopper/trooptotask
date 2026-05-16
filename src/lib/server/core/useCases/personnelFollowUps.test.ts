import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	archivePersonnelFollowUp,
	createPersonnelFollowUp,
	listPersonnelFollowUps,
	restorePersonnelFollowUp,
	setPersonnelFollowUpStatus,
	updatePersonnelFollowUp
} from './personnelFollowUps';

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
					personnel: 'operate',
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

		const created = await createPersonnelFollowUp(ctx, {
			personnelId: 'person-1',
			title: 'Complete BLC packet',
			notes: 'Confirm signatures',
			dueDate: '2026-06-01'
		});
		const completed = await setPersonnelFollowUpStatus(ctx, {
			personnelId: 'person-1',
			followUpId: created.id,
			status: 'completed'
		});
		const reopened = await setPersonnelFollowUpStatus(ctx, {
			personnelId: 'person-1',
			followUpId: created.id,
			status: 'open'
		});
		const edited = await updatePersonnelFollowUp(ctx, {
			personnelId: 'person-1',
			followUpId: created.id,
			title: 'Complete BLC packet update',
			notes: 'Confirm signatures and dates',
			dueDate: '2026-06-15'
		});
		const archived = await archivePersonnelFollowUp(ctx, {
			personnelId: 'person-1',
			followUpId: created.id
		});
		const archivedStored = await ctx.store.findOne<Record<string, unknown>>('personnel_follow_ups', ctx.auth.orgId, {
			id: created.id
		});
		const archivedStoredAt = archivedStored?.archived_at;
		const restored = await restorePersonnelFollowUp(ctx, {
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
		expect(completed.status).toBe('completed');
		expect(completed.completedAt).toBeTruthy();
		expect(reopened.status).toBe('open');
		expect(reopened.completedAt).toBeNull();
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
		await expect(listPersonnelFollowUps(ctx, 'person-1', undefined, { archived: true })).resolves.toHaveLength(0);
		const rearchived = await archivePersonnelFollowUp(ctx, {
			personnelId: 'person-1',
			followUpId: created.id
		});
		expect(rearchived.archivedAt).toBeTruthy();
		await expect(listPersonnelFollowUps(ctx, 'person-1')).resolves.toHaveLength(0);
		await expect(
			setPersonnelFollowUpStatus(ctx, {
				personnelId: 'person-1',
				followUpId: created.id,
				status: 'open'
			})
		).rejects.toMatchObject({ status: 409 });
		await expect(
			updatePersonnelFollowUp(ctx, {
				personnelId: 'person-1',
				followUpId: created.id,
				title: 'Should not update'
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it('requires Personnel operate capability', async () => {
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

		await expect(listPersonnelFollowUps(ctx, 'person-1')).rejects.toMatchObject({ status: 403 });
		await expect(createPersonnelFollowUp(ctx, { personnelId: 'person-1', title: 'Follow up' })).rejects.toMatchObject({
			status: 403
		});
		await expect(
			updatePersonnelFollowUp(ctx, { personnelId: 'person-1', followUpId: 'missing', title: 'Follow up' })
		).rejects.toMatchObject({ status: 403 });
		await expect(
			archivePersonnelFollowUp(ctx, { personnelId: 'person-1', followUpId: 'missing' })
		).rejects.toMatchObject({ status: 403 });
	});

	it('delegates Soldier scope enforcement to the auth context', async () => {
		const requireGroupAccess = vi.fn(async () => {
			throw { status: 403, message: 'Group scope denied' };
		});
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
				scopeSet: { kind: 'groups', groupIds: ['group-1'] },
				requireGroupAccess
			}
		});
		seedPersonnel(ctx, 'group-1');

		await expect(listPersonnelFollowUps(ctx, 'person-1')).rejects.toMatchObject({ status: 403 });
		expect(requireGroupAccess).toHaveBeenCalledWith('person-1');
	});
});

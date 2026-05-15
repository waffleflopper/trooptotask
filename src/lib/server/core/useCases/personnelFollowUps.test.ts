import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createPersonnelFollowUp, listPersonnelFollowUps, setPersonnelFollowUpStatus } from './personnelFollowUps';

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
	it('creates, lists, completes, and reopens dashboard follow-ups', async () => {
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

		expect(created).toMatchObject({
			personnelId: 'person-1',
			title: 'Complete BLC packet',
			status: 'open',
			createdBy: 'test-user'
		});
		expect(completed.status).toBe('completed');
		expect(completed.completedAt).toBeTruthy();
		expect(reopened.status).toBe('open');
		expect(reopened.completedAt).toBeNull();
		await expect(listPersonnelFollowUps(ctx, 'person-1')).resolves.toHaveLength(1);
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

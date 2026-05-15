import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createPersonnelLeaderNote, listPersonnelLeaderNotes } from './personnelLeaderNotes';

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

describe('personnel leader notes', () => {
	it('creates and lists leader notes in reverse chronological order', async () => {
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
		ctx.store.seed('leader_notes', [
			{
				id: 'note-old',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				author: '1SG Alvarez',
				text: 'Older note',
				created_at: '2026-04-01T12:00:00Z'
			}
		]);

		const created = await createPersonnelLeaderNote(ctx, {
			personnelId: 'person-1',
			text: 'Completed board prep packet.'
		});
		const notes = await listPersonnelLeaderNotes(ctx, 'person-1');

		expect(created).toMatchObject({
			personnelId: 'person-1',
			author: 'leader@example.com',
			text: 'Completed board prep packet.'
		});
		expect(notes.map((note) => note.id)).toEqual([created.id, 'note-old']);
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

		await expect(listPersonnelLeaderNotes(ctx, 'person-1')).rejects.toMatchObject({ status: 403 });
		await expect(createPersonnelLeaderNote(ctx, { personnelId: 'person-1', text: 'Note' })).rejects.toMatchObject({
			status: 403
		});
	});

	it('blocks group-scoped users outside the Soldier scope', async () => {
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
				scopeSet: { kind: 'groups', groupIds: ['other-group'] }
			}
		});
		seedPersonnel(ctx, 'group-1');

		await expect(listPersonnelLeaderNotes(ctx, 'person-1')).rejects.toMatchObject({ status: 403 });
	});

	it('rejects empty notes', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);

		await expect(createPersonnelLeaderNote(ctx, { personnelId: 'person-1', text: '   ' })).rejects.toMatchObject({
			status: 400
		});
	});
});

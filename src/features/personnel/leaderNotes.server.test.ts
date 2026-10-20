import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	archivePersonnelLeaderNote,
	countPersonnelLeaderNotes,
	createPersonnelLeaderNote,
	deletePersonnelLeaderNote,
	listPersonnelLeaderNotes,
	restorePersonnelLeaderNote,
	updatePersonnelLeaderNote
} from './leaderNotes.server';
import { testLeaderNoteContext } from './leaderNotes.testHelper';

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

afterEach(() => {
	vi.useRealTimers();
});

describe('personnel leader notes', () => {
	it('creates and lists leader notes in reverse chronological order', async () => {
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

		const created = await createPersonnelLeaderNote(testLeaderNoteContext(ctx), {
			personnelId: 'person-1',
			text: 'Completed board prep packet.'
		});
		const notes = await listPersonnelLeaderNotes(testLeaderNoteContext(ctx), 'person-1');

		expect(created).toMatchObject({
			personnelId: 'person-1',
			author: 'leader@example.com',
			text: 'Completed board prep packet.'
		});
		expect(notes.map((note) => note.id)).toEqual([created.id, 'note-old']);
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

		await expect(listPersonnelLeaderNotes(testLeaderNoteContext(ctx), 'person-1')).rejects.toMatchObject({
			status: 403
		});
		await expect(
			createPersonnelLeaderNote(testLeaderNoteContext(ctx), { personnelId: 'person-1', text: 'Note' })
		).rejects.toMatchObject({
			status: 403
		});
	});

	it('lets a Personnel operator create and archive a note without gaining the notes list', async () => {
		const ctx = createTestContext({
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
				}
			}
		});
		seedPersonnel(ctx);
		const notes = testLeaderNoteContext(ctx);
		const created = await createPersonnelLeaderNote(notes, { personnelId: 'person-1', text: 'Action needed' });
		await expect(
			archivePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: created.id })
		).resolves.toMatchObject({
			id: created.id,
			archivedAt: expect.any(String)
		});
		await expect(listPersonnelLeaderNotes(notes, 'person-1')).rejects.toMatchObject({ status: 403 });
	});

	it('blocks group-scoped users outside the Soldier scope', async () => {
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
				scopeSet: { kind: 'groups', groupIds: ['other-group'] }
			}
		});
		seedPersonnel(ctx, 'group-1');

		await expect(listPersonnelLeaderNotes(testLeaderNoteContext(ctx), 'person-1')).rejects.toMatchObject({
			status: 403
		});
		await expect(
			createPersonnelLeaderNote(testLeaderNoteContext(ctx), { personnelId: 'person-1', text: 'Private observation' })
		).rejects.toMatchObject({ status: 403 });
		await expect(ctx.rawStore.findMany('leader_notes', ctx.auth.orgId)).resolves.toEqual([]);
	});

	it('keeps note mutations scoped to the requested Soldier and retains archive conflicts', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		ctx.store.seed('personnel', [{ id: 'person-2', organization_id: ctx.auth.orgId, group_id: null }]);
		const notes = testLeaderNoteContext(ctx);
		await expect(listPersonnelLeaderNotes(notes, 'missing-person')).rejects.toMatchObject({ status: 404 });
		const created = await createPersonnelLeaderNote(notes, { personnelId: 'person-1', text: 'Observation' });
		await expect(
			archivePersonnelLeaderNote(notes, { personnelId: 'missing-person', noteId: created.id })
		).rejects.toMatchObject({ status: 404 });
		await expect(
			archivePersonnelLeaderNote(notes, { personnelId: 'person-2', noteId: created.id })
		).rejects.toMatchObject({ status: 404 });
		await expect(
			deletePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: created.id })
		).rejects.toMatchObject({ status: 409 });
		const archived = await archivePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: created.id });
		expect(archived.archivedAt).toBeTruthy();
		await expect(
			archivePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: created.id })
		).rejects.toMatchObject({ status: 409 });
		const restored = await restorePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: created.id });
		expect(restored.archivedAt).toBeNull();
		await expect(
			restorePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: created.id })
		).resolves.toMatchObject({ archivedAt: null });
	});

	it('edits a note in place, stamps updated_at, and refuses to edit an archived note', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
		const ctx = createTestContext();
		seedPersonnel(ctx);
		const notes = testLeaderNoteContext(ctx);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				author: 'SFC Jones',
				text: 'First draft',
				created_at: '2026-05-01T10:00:00Z',
				updated_at: '2026-05-01T10:00:00Z'
			}
		]);
		const ids = { personnelId: 'person-1', noteId: 'note-1' };

		const edited = await updatePersonnelLeaderNote(notes, { ...ids, text: 'Second draft' });
		expect(edited).toMatchObject({ id: 'note-1', text: 'Second draft', createdAt: '2026-05-01T10:00:00Z' });
		const stored = await ctx.store.findOne<Record<string, unknown>>('leader_notes', ctx.auth.orgId, {
			id: 'note-1'
		});
		expect(stored?.text).toBe('Second draft');
		expect(stored?.updated_at).toBe('2026-06-02T12:00:00.000Z');
		expect(stored?.created_at).toBe('2026-05-01T10:00:00Z');

		await expect(updatePersonnelLeaderNote(notes, { ...ids, text: '   ' })).rejects.toMatchObject({ status: 400 });
		await archivePersonnelLeaderNote(notes, ids);
		await expect(updatePersonnelLeaderNote(notes, { ...ids, text: 'Late edit' })).rejects.toMatchObject({
			status: 409
		});
		await expect(
			updatePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: 'missing', text: 'x' })
		).rejects.toMatchObject({ status: 404 });
	});

	it('refuses to edit a note without Personnel operate access, outside the Group, or through another Soldier', async () => {
		const note = (ctx: ReturnType<typeof createTestContext>) => ({
			id: 'note-1',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			author: 'SFC Jones',
			text: 'First draft',
			created_at: '2026-05-01T10:00:00Z',
			updated_at: '2026-05-01T10:00:00Z'
		});
		const edit = { personnelId: 'person-1', noteId: 'note-1', text: 'Second draft' };
		const capabilities = (personnel: 'view' | 'operate') => ({
			calendar: 'none' as const,
			personnel,
			training: 'none' as const,
			criticalTasks: 'none' as const,
			onboarding: 'none' as const,
			ratingScheme: 'none' as const
		});

		const viewer = createTestContext({
			auth: { role: 'member', isPrivileged: false, capabilityMap: capabilities('view') }
		});
		seedPersonnel(viewer);
		viewer.store.seed('leader_notes', [note(viewer)]);
		await expect(updatePersonnelLeaderNote(testLeaderNoteContext(viewer), edit)).rejects.toMatchObject({ status: 403 });

		const outsideGroup = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: capabilities('operate'),
				scopeSet: { kind: 'groups', groupIds: ['other-group'] }
			}
		});
		seedPersonnel(outsideGroup, 'group-1');
		outsideGroup.store.seed('leader_notes', [note(outsideGroup)]);
		await expect(updatePersonnelLeaderNote(testLeaderNoteContext(outsideGroup), edit)).rejects.toMatchObject({
			status: 403
		});

		const operator = createTestContext({
			auth: { role: 'member', isPrivileged: false, capabilityMap: capabilities('operate') }
		});
		seedPersonnel(operator);
		operator.store.seed('personnel', [{ id: 'person-2', organization_id: operator.auth.orgId, group_id: null }]);
		operator.store.seed('leader_notes', [note(operator)]);
		await expect(
			updatePersonnelLeaderNote(testLeaderNoteContext(operator), { ...edit, personnelId: 'person-2' })
		).rejects.toMatchObject({ status: 404 });

		for (const ctx of [viewer, outsideGroup, operator]) {
			const stored = await ctx.store.findOne<Record<string, unknown>>('leader_notes', ctx.auth.orgId, { id: 'note-1' });
			expect(stored?.text).toBe('First draft');
		}
	});

	it('counts only active notes, pages older notes from a cursor, and names who archived', async () => {
		const ctx = createTestContext({ auth: { userId: LEADER_USER_ID, scopeSet: { kind: 'organization' } } });
		seedPersonnel(ctx);
		ctx.store.seed('organization_memberships', [
			{
				id: 'membership-1',
				organization_id: ctx.auth.orgId,
				user_id: LEADER_USER_ID,
				email: 'leader@example.com'
			}
		]);
		const note = (id: string, createdAt: string, archivedAt: string | null = null) => ({
			id,
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			author: 'SFC Jones',
			text: `Text ${id}`,
			created_at: createdAt,
			archived_at: archivedAt
		});
		ctx.store.seed('leader_notes', [
			note('n1', '2026-01-01T00:00:00Z'),
			note('n2', '2026-02-01T00:00:00Z'),
			note('n3', '2026-03-01T00:00:00Z'),
			note('n4', '2026-04-01T00:00:00Z', '2026-04-02T00:00:00Z')
		]);
		const notes = testLeaderNoteContext(ctx);

		await expect(countPersonnelLeaderNotes(notes, 'person-1')).resolves.toBe(3);
		const firstPage = await listPersonnelLeaderNotes(notes, 'person-1', 2);
		expect(firstPage.map((n) => n.id)).toEqual(['n3', 'n2']);
		const olderPage = await listPersonnelLeaderNotes(notes, 'person-1', 2, {
			before: { createdAt: firstPage[1].createdAt, id: firstPage[1].id }
		});
		expect(olderPage.map((n) => n.id)).toEqual(['n1']);

		await archivePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: 'n3' });
		const archived = await listPersonnelLeaderNotes(notes, 'person-1', undefined, { archived: true });
		expect(archived.find((n) => n.id === 'n3')).toMatchObject({ archivedBy: 'leader@example.com' });
		expect(archived.find((n) => n.id === 'n4')).toMatchObject({ archivedBy: null });
		await expect(countPersonnelLeaderNotes(notes, 'person-1')).resolves.toBe(2);
	});

	it('rejects empty notes', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);

		await expect(
			createPersonnelLeaderNote(testLeaderNoteContext(ctx), { personnelId: 'person-1', text: '   ' })
		).rejects.toMatchObject({
			status: 400
		});
	});
});

describe('leader note write responses', () => {
	const AUTHOR_USER_ID = '22222222-2222-4222-8222-222222222222';
	const operateOnly = {
		role: 'member' as const,
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none' as const,
			personnel: 'operate' as const,
			training: 'none' as const,
			criticalTasks: 'none' as const,
			onboarding: 'none' as const,
			ratingScheme: 'none' as const
		}
	};
	const ids = { personnelId: 'person-1', noteId: 'note-1' };

	function seededNote(auth: NonNullable<Parameters<typeof createTestContext>[0]>['auth'] = {}) {
		const ctx = createTestContext({ auth: { scopeSet: { kind: 'organization' }, ...auth } });
		seedPersonnel(ctx);
		ctx.store.seed('organization_memberships', [
			{ id: 'membership-2', organization_id: ctx.auth.orgId, user_id: AUTHOR_USER_ID, email: 'author@example.com' }
		]);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				author: AUTHOR_USER_ID,
				text: 'First draft',
				created_at: '2026-05-01T10:00:00Z',
				updated_at: '2026-05-01T10:00:00Z'
			}
		]);
		return ctx;
	}

	function withFailingLookup(ctx: ReturnType<typeof createTestContext>) {
		return {
			...testLeaderNoteContext(ctx),
			contributorLabels: async (): Promise<Map<string, string>> => {
				throw new Error('label lookup failed');
			}
		};
	}

	it('tells an editor who may read sensitive records who wrote the note and when', async () => {
		const ctx = seededNote();

		const saved = await updatePersonnelLeaderNote(testLeaderNoteContext(ctx), { ...ids, text: 'Second draft' });

		expect(saved).toMatchObject({
			id: 'note-1',
			text: 'Second draft',
			author: 'author@example.com',
			createdAt: '2026-05-01T10:00:00Z'
		});
	});

	it('tells an editor who may not read sensitive records only that the note was saved', async () => {
		const ctx = seededNote(operateOnly);

		const saved = await updatePersonnelLeaderNote(testLeaderNoteContext(ctx), { ...ids, text: 'Second draft' });

		expect(saved).toEqual({ id: 'note-1', archivedAt: null });
		expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-1' })).toMatchObject({
			text: 'Second draft'
		});
	});

	it('still reports a saved edit when the access check after the write fails', async () => {
		const ctx = seededNote();
		const base = testLeaderNoteContext(ctx);
		let lookups = 0;
		const context = {
			...base,
			persistence: {
				...base.persistence,
				async findPersonnelGroup(personnelId: string) {
					if (++lookups > 1) throw new Error('group lookup failed');
					return base.persistence.findPersonnelGroup(personnelId);
				}
			}
		};

		const saved = await updatePersonnelLeaderNote(context, { ...ids, text: 'Second draft' });

		expect(saved).toEqual({ id: 'note-1', archivedAt: null });
		expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-1' })).toMatchObject({
			text: 'Second draft'
		});
	});

	it('still reports a created note, once, without naming its author when the name lookup fails', async () => {
		const ctx = seededNote();

		const created = await createPersonnelLeaderNote(withFailingLookup(ctx), {
			personnelId: 'person-1',
			text: 'Counseled on punctuality.'
		});

		expect(created).toMatchObject({ text: 'Counseled on punctuality.', author: 'Unknown leader' });
		const stored = await ctx.store.findMany('leader_notes', ctx.auth.orgId, { personnel_id: 'person-1' });
		expect(stored).toHaveLength(2);
	});

	it('still reports an edited note without naming its author when the name lookup fails', async () => {
		const ctx = seededNote();

		const saved = await updatePersonnelLeaderNote(withFailingLookup(ctx), { ...ids, text: 'Second draft' });

		expect(saved).toMatchObject({ id: 'note-1', text: 'Second draft', author: 'Unknown leader' });
		expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-1' })).toMatchObject({
			text: 'Second draft'
		});
	});
});

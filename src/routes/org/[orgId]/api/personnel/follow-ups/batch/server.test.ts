import { describe, expect, it } from 'vitest';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig as followUpBatch } from './+server';
import { _postConfig as noteBatch } from '../../leader-notes/batch/+server';

const alpha = '0a000000-0000-4000-8000-000000000001';
const bravo = '0b000000-0000-4000-8000-000000000002';
const able = '1a000000-0000-4000-8000-000000000001';
const baker = '1b000000-0000-4000-8000-000000000002';
const archived = '1c000000-0000-4000-8000-000000000003';
const unassigned = '1d000000-0000-4000-8000-000000000004';
const missing = '1f000000-0000-4000-8000-000000000006';

function context(personnel: 'view' | 'operate', scopeSet: ScopeSet = { kind: 'organization' }) {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar: 'none',
				personnel,
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet
		}
	});
	const orgId = ctx.auth.orgId;
	ctx.rawStore.seed('groups', [
		{ id: alpha, organization_id: orgId, name: 'Alpha', sort_order: 0 },
		{ id: bravo, organization_id: orgId, name: 'Bravo', sort_order: 1 }
	]);
	const person = (id: string, last: string, groupId: string | null, archivedAt: string | null = null) => ({
		id,
		organization_id: orgId,
		rank: 'SGT',
		last_name: last,
		first_name: 'Pat',
		group_id: groupId,
		archived_at: archivedAt
	});
	ctx.rawStore.seed('personnel', [
		person(able, 'Able', alpha),
		person(baker, 'Baker', bravo),
		person(archived, 'Archived', alpha, '2026-01-01T00:00:00Z'),
		person(unassigned, 'Unassigned', null)
	]);
	return ctx;
}

type Ctx = ReturnType<typeof context>;
const post = (config: typeof followUpBatch, ctx: Ctx, input: Record<string, unknown>) =>
	handleUseCaseRequest(config, ctx, input, () => ctx);

const followUps = (ctx: Ctx) => ctx.rawStore.findMany<Record<string, unknown>>('personnel_follow_ups', ctx.auth.orgId);
const notes = (ctx: Ctx) => ctx.rawStore.findMany<Record<string, unknown>>('leader_notes', ctx.auth.orgId);

describe('POST /api/personnel/follow-ups/batch', () => {
	it('writes one open follow-up per active Person, attributed to the actor, and reports the rest', async () => {
		const ctx = context('operate');

		await expect(
			post(followUpBatch, ctx, {
				personnelIds: [able, baker, archived, unassigned, missing, able],
				title: ' Turn in TA-50 ',
				notes: 'Bring the hand receipt',
				dueDate: '2026-10-30',
				createdBy: 'someone-else'
			})
		).resolves.toEqual({ writtenIds: [able, baker, unassigned], unavailableIds: [archived, missing] });

		const rows = await followUps(ctx);
		expect(
			rows.map(({ personnel_id, title, notes, due_date, status, created_by }) => ({
				personnel_id,
				title,
				notes,
				due_date,
				status,
				created_by
			}))
		).toEqual(
			[able, baker, unassigned].map((personnel_id) => ({
				personnel_id,
				title: 'Turn in TA-50',
				notes: 'Bring the hand receipt',
				due_date: '2026-10-30',
				status: 'open',
				created_by: ctx.auth.userId
			}))
		);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'personnel.follow_up.created',
				resourceType: 'personnel',
				details: { personnelIds: [able, baker, unassigned] }
			})
		]);
	});

	it('writes only inside a Group-scoped operator’s Groups and reports the others as unavailable', async () => {
		const ctx = context('operate', { kind: 'groups', groupIds: [alpha] });

		await expect(
			post(followUpBatch, ctx, { personnelIds: [able, baker, unassigned], title: 'Weapons card' })
		).resolves.toEqual({ writtenIds: [able], unavailableIds: [baker, unassigned] });
		expect((await followUps(ctx)).map((row) => [row.personnel_id, row.due_date])).toEqual([[able, null]]);
	});

	it('writes nothing and logs no event when nobody can be written', async () => {
		const ctx = context('operate', { kind: 'groups', groupIds: [alpha] });

		await expect(post(followUpBatch, ctx, { personnelIds: [baker], title: 'Weapons card' })).resolves.toEqual({
			writtenIds: [],
			unavailableIds: [baker]
		});
		expect(await followUps(ctx)).toEqual([]);
		expect(ctx.auditPort.events.filter((event) => event.action === 'personnel.follow_up.created')).toEqual([]);
	});

	it('fails the request when its audit event cannot be recorded', async () => {
		const ctx = context('operate');
		const failingAudit = {
			...ctx,
			audit: {
				log: async () => {
					throw new Error('audit down');
				}
			}
		};

		await expect(
			handleUseCaseRequest(followUpBatch, ctx, { personnelIds: [able], title: 'Weapons card' }, () => failingAudit)
		).rejects.toThrow('audit down');
	});

	it('refuses a Personnel viewer and malformed input without writing', async () => {
		await expect(
			post(followUpBatch, context('view'), { personnelIds: [able], title: 'Weapons card' })
		).rejects.toMatchObject({ status: 403 });

		const ctx = context('operate');
		for (const input of [
			{ personnelIds: [], title: 'Weapons card' },
			{ personnelIds: ['not-a-uuid'], title: 'Weapons card' },
			{ personnelIds: Array.from({ length: 501 }, () => able), title: 'Weapons card' },
			{ personnelIds: [able], title: '  ' },
			{ personnelIds: [able], title: 'Weapons card', dueDate: '30 Oct' }
		]) {
			await expect(post(followUpBatch, ctx, input)).rejects.toMatchObject({ status: 400 });
		}
		expect(await followUps(ctx)).toEqual([]);
	});
});

describe('POST /api/personnel/leader-notes/batch', () => {
	it('writes the same note on each writable Person, authored by the actor', async () => {
		const ctx = context('operate', { kind: 'groups', groupIds: [alpha, bravo] });

		await expect(
			post(noteBatch, ctx, { personnelIds: [able, baker, unassigned], text: ' Great range day ', author: 'x' })
		).resolves.toEqual({ writtenIds: [able, baker], unavailableIds: [unassigned] });
		expect((await notes(ctx)).map(({ personnel_id, text, author }) => ({ personnel_id, text, author }))).toEqual([
			{ personnel_id: able, text: 'Great range day', author: ctx.auth.userId },
			{ personnel_id: baker, text: 'Great range day', author: ctx.auth.userId }
		]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'personnel.leader_note.created', details: { personnelIds: [able, baker] } })
		]);
	});

	it('refuses a Personnel viewer and an empty note', async () => {
		await expect(post(noteBatch, context('view'), { personnelIds: [able], text: 'Hi' })).rejects.toMatchObject({
			status: 403
		});
		const ctx = context('operate');
		await expect(post(noteBatch, ctx, { personnelIds: [able], text: ' ' })).rejects.toMatchObject({ status: 400 });
		expect(await notes(ctx)).toEqual([]);
	});
});

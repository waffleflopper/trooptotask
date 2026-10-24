import { describe, expect, it } from 'vitest';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const alpha = '0a000000-0000-4000-8000-000000000001';
const bravo = '0b000000-0000-4000-8000-000000000002';
const charlie = '0c000000-0000-4000-8000-000000000003';
const able = '1a000000-0000-4000-8000-000000000001';
const baker = '1b000000-0000-4000-8000-000000000002';
const archived = '1c000000-0000-4000-8000-000000000003';
const unassigned = '1d000000-0000-4000-8000-000000000004';
const charlieMember = '1e000000-0000-4000-8000-000000000005';
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
		{ id: bravo, organization_id: orgId, name: 'Bravo', sort_order: 1 },
		{ id: charlie, organization_id: orgId, name: 'Charlie', sort_order: 2 }
	]);
	const person = (id: string, last: string, groupId: string | null, archivedAt: string | null = null) => ({
		id,
		organization_id: orgId,
		rank: 'SGT',
		last_name: last,
		first_name: 'Pat',
		mos: '68W',
		clinic_role: '',
		group_id: groupId,
		archived_at: archivedAt
	});
	ctx.rawStore.seed('personnel', [
		person(able, 'Able', alpha),
		person(baker, 'Baker', bravo),
		person(archived, 'Archived', alpha, '2026-01-01T00:00:00Z'),
		person(unassigned, 'Unassigned', null),
		person(charlieMember, 'Charlie', charlie)
	]);
	return ctx;
}

const move = (ctx: ReturnType<typeof context>, input: Record<string, unknown>) =>
	handleUseCaseRequest(_postConfig, ctx, input, () => ctx);

async function groupOf(ctx: ReturnType<typeof context>, id: string) {
	const row = await ctx.rawStore.findOne<{ group_id: string | null }>('personnel', ctx.auth.orgId, { id });
	return row?.group_id;
}

describe('POST /api/personnel/group-membership', () => {
	it('moves active People into a Group in one write and reports the ones it could not move', async () => {
		const ctx = context('operate');

		await expect(
			move(ctx, { personnelIds: [able, baker, archived, unassigned, missing], groupId: charlie })
		).resolves.toEqual({
			groupId: charlie,
			movedIds: [able, baker, unassigned],
			unavailableIds: [archived, missing]
		});
		expect([await groupOf(ctx, able), await groupOf(ctx, baker), await groupOf(ctx, unassigned)]).toEqual([
			charlie,
			charlie,
			charlie
		]);
		expect(await groupOf(ctx, archived)).toBe(alpha);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'personnel.group_changed',
				details: { groupId: charlie, personnelIds: [able, baker, unassigned] }
			})
		]);
	});

	it('moves People to Unassigned and counts someone already there as moved without another write', async () => {
		const ctx = context('operate');

		await expect(move(ctx, { personnelIds: [able, unassigned], groupId: null })).resolves.toEqual({
			groupId: null,
			movedIds: [able, unassigned],
			unavailableIds: []
		});
		expect(await groupOf(ctx, able)).toBeNull();
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'personnel.group_changed', details: { groupId: null, personnelIds: [able] } })
		]);
	});

	it('lets a Group-scoped operator move People only between their own Groups', async () => {
		const ctx = context('operate', { kind: 'groups', groupIds: [alpha, bravo] });

		await expect(move(ctx, { personnelIds: [able], groupId: bravo })).resolves.toMatchObject({
			movedIds: [able],
			unavailableIds: []
		});
		await expect(move(ctx, { personnelIds: [baker], groupId: charlie })).rejects.toMatchObject({ status: 403 });
		await expect(move(ctx, { personnelIds: [baker], groupId: null })).rejects.toMatchObject({ status: 403 });
		await expect(move(ctx, { personnelIds: [charlieMember, unassigned], groupId: alpha })).resolves.toEqual({
			groupId: alpha,
			movedIds: [],
			unavailableIds: [charlieMember, unassigned]
		});
		expect([await groupOf(ctx, baker), await groupOf(ctx, charlieMember), await groupOf(ctx, unassigned)]).toEqual([
			bravo,
			charlie,
			null
		]);
	});

	it('refuses a Personnel viewer, an unknown Group and malformed input without writing', async () => {
		const viewer = context('view');
		await expect(move(viewer, { personnelIds: [able], groupId: bravo })).rejects.toMatchObject({ status: 403 });

		const ctx = context('operate');
		await expect(
			move(ctx, { personnelIds: [able], groupId: '0d000000-0000-4000-8000-000000000004' })
		).rejects.toMatchObject({ status: 404, body: { message: 'That Group is no longer available.' } });
		for (const input of [
			{ personnelIds: [], groupId: bravo },
			{ personnelIds: ['not-a-uuid'], groupId: bravo },
			{ personnelIds: Array.from({ length: 501 }, () => able), groupId: bravo },
			{ personnelIds: [able] }
		]) {
			await expect(move(ctx, input)).rejects.toMatchObject({ status: 400 });
		}
		expect(await groupOf(ctx, able)).toBe(alpha);
		expect(ctx.auditPort.events.filter((event) => event.action === 'personnel.group_changed')).toEqual([]);
	});
});

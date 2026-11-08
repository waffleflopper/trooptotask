import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it } from 'vitest';
import type { GroupCoverage } from '$lib/access/memberAccessShape';
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
const gone = '0d000000-0000-4000-8000-000000000004';

/** Everyone starts in the Group a move would have put them in: Bravo, except where a test says otherwise. */
function context(personnel: 'view' | 'operate', scopeSet: GroupCoverage = { kind: 'organization' }) {
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
		person(able, 'Able', bravo),
		person(baker, 'Baker', bravo),
		person(archived, 'Archived', bravo, '2026-01-01T00:00:00Z'),
		person(unassigned, 'Unassigned', null),
		person(charlieMember, 'Charlie', charlie)
	]);
	return ctx;
}

const undo = (ctx: ReturnType<typeof context>, input: Record<string, unknown>) =>
	handleUseCaseRequest(_postConfig, ctx, input, () => ctx);
const put = (personnelId: string, fromGroupId: string | null, toGroupId: string | null) => ({
	personnelId,
	fromGroupId,
	toGroupId
});

async function groupOf(ctx: ReturnType<typeof context>, id: string) {
	const row = await ctx.rawStore.findOne<{ group_id: string | null }>('personnel', ctx.auth.orgId, { id });
	return row?.group_id;
}

describe('POST /api/personnel/group-membership/undo', () => {
	it('puts People back in the Groups they came from, including Unassigned', async () => {
		const ctx = context('operate');

		await expect(undo(ctx, { moves: [put(able, bravo, alpha), put(baker, bravo, null)] })).resolves.toEqual({
			restoredIds: [able, baker],
			changedIds: []
		});
		expect([await groupOf(ctx, able), await groupOf(ctx, baker)]).toEqual([alpha, null]);
	});

	it('restores People who were moved to Unassigned', async () => {
		const ctx = context('operate');

		await expect(undo(ctx, { moves: [put(unassigned, null, alpha)] })).resolves.toEqual({
			restoredIds: [unassigned],
			changedIds: []
		});
		expect(await groupOf(ctx, unassigned)).toBe(alpha);
	});

	it('leaves alone and reports anyone archived, missing, or moved again since', async () => {
		const ctx = context('operate');

		await expect(
			undo(ctx, {
				moves: [
					put(able, bravo, alpha),
					put(archived, bravo, alpha),
					put(missing, bravo, alpha),
					put(charlieMember, bravo, alpha),
					put(unassigned, bravo, alpha)
				]
			})
		).resolves.toEqual({ restoredIds: [able], changedIds: [archived, missing, charlieMember, unassigned] });
		expect([
			await groupOf(ctx, able),
			await groupOf(ctx, archived),
			await groupOf(ctx, charlieMember),
			await groupOf(ctx, unassigned)
		]).toEqual([alpha, bravo, charlie, null]);
	});

	it('reports People whose original Group no longer exists instead of failing the rest', async () => {
		const ctx = context('operate');

		await expect(undo(ctx, { moves: [put(able, bravo, gone), put(baker, bravo, alpha)] })).resolves.toEqual({
			restoredIds: [baker],
			changedIds: [able]
		});
		expect([await groupOf(ctx, able), await groupOf(ctx, baker)]).toEqual([bravo, alpha]);
	});

	it('lets a Group-scoped operator undo only between their own Groups', async () => {
		const ctx = context('operate', groupCoverageForTest({ kind: 'groups', groupIds: [alpha, bravo] }));

		await expect(undo(ctx, { moves: [put(able, bravo, alpha)] })).resolves.toEqual({
			restoredIds: [able],
			changedIds: []
		});
		await expect(undo(ctx, { moves: [put(baker, bravo, charlie)] })).rejects.toMatchObject({ status: 403 });
		await expect(undo(ctx, { moves: [put(charlieMember, charlie, alpha)] })).rejects.toMatchObject({ status: 403 });
		await expect(undo(ctx, { moves: [put(baker, bravo, null)] })).rejects.toMatchObject({ status: 403 });
		expect([await groupOf(ctx, baker), await groupOf(ctx, charlieMember)]).toEqual([bravo, charlie]);
	});

	it('refuses a Personnel viewer and malformed input without writing', async () => {
		const viewer = context('view');
		await expect(undo(viewer, { moves: [put(able, bravo, alpha)] })).rejects.toMatchObject({ status: 403 });
		expect(await groupOf(viewer, able)).toBe(bravo);

		const ctx = context('operate');
		for (const input of [
			{ moves: [] },
			{ moves: [put('not-a-uuid', bravo, alpha)] },
			{ moves: [put(able, bravo, alpha), put(able, bravo, charlie)] },
			{ moves: Array.from({ length: 501 }, () => put(able, bravo, alpha)) },
			{ moves: [{ personnelId: able, fromGroupId: bravo }] },
			{ moves: [{ ...put(able, bravo, alpha), extra: true }] },
			{}
		]) {
			await expect(undo(ctx, input)).rejects.toMatchObject({ status: 400 });
		}
		expect(await groupOf(ctx, able)).toBe(bravo);
	});

	it('refuses a Group that does not exist for a Group-scoped operator rather than revealing it', async () => {
		const ctx = context('operate', groupCoverageForTest({ kind: 'groups', groupIds: [alpha, bravo] }));

		await expect(undo(ctx, { moves: [put(able, bravo, gone)] })).rejects.toMatchObject({ status: 403 });
		expect(await groupOf(ctx, able)).toBe(bravo);
	});
});

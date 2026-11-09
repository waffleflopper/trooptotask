import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { createDeletionRequestTestStore } from '$features/deletion-requests/testing.server';
import { ARCHIVE_UNDO_WINDOW_MS, issueArchiveUndo } from '$features/personnel/index.server';
import type { GroupCoverage } from '$lib/access/memberAccessShape';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { _deleteConfig } from '../../+server';
import { _createPostConfig as archiveConfig } from '../+server';
import { _createPostConfig as undoConfig } from './+server';

const NOW = new Date('2026-11-08T12:00:00.000Z');
const ALPHA = '0a000000-0000-4000-8000-000000000001';
const BRAVO = '0a000000-0000-4000-8000-000000000002';
const ABLE = '1a000000-0000-4000-8000-000000000001';
const BAKER = '1b000000-0000-4000-8000-000000000002';
const CHARLIE = '1c000000-0000-4000-8000-000000000003';
const EARLIER = '1d000000-0000-4000-8000-000000000004';
const EARLIER_STAMP = '2026-10-01T08:00:00.000Z';

type Context = ReturnType<typeof context>;

function context(
	personnel: 'view' | 'operate' | 'configure' = 'configure',
	scopeSet: GroupCoverage = { kind: 'organization' }
) {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar: 'view',
				personnel,
				training: 'view',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			},
			scopeSet
		}
	});
	const person = (id: string, last: string, groupId: string, archivedAt: string | null = null) => ({
		id,
		organization_id: ctx.auth.orgId,
		rank: 'SGT',
		last_name: last,
		first_name: 'Pat',
		group_id: groupId,
		archived_at: archivedAt
	});
	ctx.rawStore.seed('personnel', [
		person(ABLE, 'Able', ALPHA),
		person(BAKER, 'Baker', ALPHA),
		person(CHARLIE, 'Charlie', BRAVO),
		person(EARLIER, 'Earlier', ALPHA, EARLIER_STAMP)
	]);
	return ctx;
}

/** Withdraws a request the way the database does: only a pending one, by changing its status. */
function cancellationFor(ctx: Context) {
	return {
		async cancelPendingRequest(orgId: string, requestId: string) {
			await ctx.rawStore.update('deletion_requests', orgId, requestId, { status: 'cancelled' });
		}
	};
}
const store = (ctx: Context) => createDeletionRequestTestStore(ctx.store);

async function archive(ctx: Context, ids: string[]) {
	return handleUseCaseRequest(archiveConfig(store(ctx)), ctx, { ids, userEmail: 'requester@example.com' }, () => ctx);
}
const undo = (ctx: Context, token: unknown) =>
	handleUseCaseRequest(undoConfig(store(ctx), cancellationFor(ctx)), ctx, { token }, () => ctx);

async function archivedAt(ctx: Context, id: string) {
	return (await ctx.rawStore.findOne<{ archived_at: string | null }>('personnel', ctx.auth.orgId, { id }))?.archived_at;
}
const requestStatuses = async (ctx: Context) =>
	(await ctx.rawStore.findMany<{ status: string }>('deletion_requests', ctx.auth.orgId)).map((row) => row.status);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('POST /api/personnel/archive-batch/undo', () => {
	it('declares policy-first authorization', () => {
		const ctx = context();
		expect(undoConfig(store(ctx), cancellationFor(ctx))).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' }
		});
	});

	it('restores exactly the People the archive wrote and leaves earlier archives archived', async () => {
		const ctx = context();
		const { undo: token } = await archive(ctx, [ABLE, BAKER, EARLIER]);

		expect(await archivedAt(ctx, ABLE)).toBe(NOW.toISOString());
		await expect(undo(ctx, token)).resolves.toEqual({
			restoredIds: [ABLE, BAKER],
			changedIds: [],
			withdrawnRequestIds: [],
			reviewedRequestIds: []
		});
		expect([await archivedAt(ctx, ABLE), await archivedAt(ctx, BAKER), await archivedAt(ctx, EARLIER)]).toEqual([
			null,
			null,
			EARLIER_STAMP
		]);
	});

	it('takes back the archive of one Person from their record', async () => {
		const ctx = context();
		const archived = await handleUseCaseRequest(_deleteConfig, ctx, { id: ABLE }, () => ctx);

		expect(archived).toEqual({ success: true, undo: expect.any(String) });
		await expect(undo(ctx, (archived as { undo: string }).undo)).resolves.toMatchObject({ restoredIds: [ABLE] });
		expect(await archivedAt(ctx, ABLE)).toBeNull();
	});

	it('withdraws the requests an approval-needed role submitted and archives no one', async () => {
		const ctx = context('operate');
		const { undo: token, approvalRequestedIds } = await archive(ctx, [ABLE, BAKER]);
		expect(approvalRequestedIds).toEqual([ABLE, BAKER]);
		const requestIds = (await ctx.rawStore.findMany<{ id: string }>('deletion_requests', ctx.auth.orgId)).map(
			(row) => row.id
		);

		await expect(undo(ctx, token)).resolves.toEqual({
			restoredIds: [],
			changedIds: [],
			withdrawnRequestIds: requestIds,
			reviewedRequestIds: []
		});
		expect(await requestStatuses(ctx)).toEqual(['cancelled', 'cancelled']);
		expect([await archivedAt(ctx, ABLE), await archivedAt(ctx, BAKER)]).toEqual([null, null]);
	});

	it('does not claim a request that already existed before the archive', async () => {
		const ctx = context('operate');
		await archive(ctx, [ABLE]);
		const [first] = await ctx.rawStore.findMany<{ id: string }>('deletion_requests', ctx.auth.orgId);

		const { undo: token, approvalRequestedIds } = await archive(ctx, [ABLE, BAKER]);

		expect(approvalRequestedIds).toEqual([ABLE, BAKER]);
		const result = await undo(ctx, token);
		expect(result.withdrawnRequestIds).toHaveLength(1);
		expect(result.withdrawnRequestIds).not.toContain(first.id);
		expect((await requestStatuses(ctx)).sort()).toEqual(['cancelled', 'pending']);
	});

	it('reports a request an admin already reviewed and still restores the rest', async () => {
		const ctx = context();
		const { undo: direct } = await archive(ctx, [ABLE]);
		const operator = context('operate');
		const { undo: asked } = await archive(operator, [BAKER]);
		const [request] = await operator.rawStore.findMany<{ id: string }>('deletion_requests', operator.auth.orgId);
		await operator.rawStore.update('deletion_requests', operator.auth.orgId, request.id, { status: 'approved' });

		await expect(undo(operator, asked)).resolves.toEqual({
			restoredIds: [],
			changedIds: [],
			withdrawnRequestIds: [],
			reviewedRequestIds: [request.id]
		});
		await expect(undo(ctx, direct)).resolves.toMatchObject({ restoredIds: [ABLE] });
	});

	it('leaves alone and reports anyone restored, archived again, or moved out of reach since', async () => {
		const ctx = context('configure', groupCoverageForTest({ kind: 'groups', groupIds: [ALPHA] }));
		const { undo: token } = await archive(ctx, [ABLE, BAKER]);
		await ctx.rawStore.update('personnel', ctx.auth.orgId, ABLE, { archived_at: null });
		await ctx.rawStore.update('personnel', ctx.auth.orgId, BAKER, { group_id: BRAVO });

		await expect(undo(ctx, token)).resolves.toMatchObject({ restoredIds: [], changedIds: [ABLE, BAKER] });
		expect(await archivedAt(ctx, ABLE)).toBeNull();
		expect(await archivedAt(ctx, BAKER)).toBe(NOW.toISOString());
	});

	it('does not restore someone archived again under a later event', async () => {
		const ctx = context();
		const { undo: token } = await archive(ctx, [ABLE]);
		await ctx.rawStore.update('personnel', ctx.auth.orgId, ABLE, { archived_at: '2026-11-08T12:00:30.000Z' });

		await expect(undo(ctx, token)).resolves.toMatchObject({ restoredIds: [], changedIds: [ABLE] });
		expect(await archivedAt(ctx, ABLE)).toBe('2026-11-08T12:00:30.000Z');
	});

	it('leaves the archive in place and reports it when the actor lost the access archiving needed', async () => {
		const ctx = context('configure');
		const { undo: token } = await archive(ctx, [ABLE]);
		ctx.auth = { ...ctx.auth, capabilityMap: { ...ctx.auth.capabilityMap, personnel: 'operate' } };

		await expect(undo(ctx, token)).resolves.toMatchObject({ restoredIds: [], changedIds: [ABLE] });
		expect(await archivedAt(ctx, ABLE)).toBe(NOW.toISOString());
	});

	it('refuses a token issued to someone else, for another Organization, tampered with, or expired', async () => {
		const ctx = context();
		const { undo: token } = await archive(ctx, [ABLE]);
		const issuedTo = (orgId: string, actorId: string) =>
			issueArchiveUndo({ orgId, actorId }, { archivedAt: NOW.toISOString(), personnelIds: [ABLE], requestIds: [] });
		const [payload, signature] = String(token).split('.');

		for (const refused of [
			issuedTo(ctx.auth.orgId, 'someone-else'),
			issuedTo('another-org', ctx.auth.userId),
			`${Buffer.from(JSON.stringify({ orgId: ctx.auth.orgId })).toString('base64url')}.${signature}`,
			`${payload}.AAAA`,
			'',
			undefined
		]) {
			await expect(undo(ctx, refused)).rejects.toMatchObject({ status: 403 });
		}
		vi.setSystemTime(NOW.getTime() + ARCHIVE_UNDO_WINDOW_MS);
		await expect(undo(ctx, token)).rejects.toMatchObject({ status: 410 });
		expect(await archivedAt(ctx, ABLE)).toBe(NOW.toISOString());
	});

	it('refuses a role without Personnel management before reading the token', async () => {
		const ctx = context();
		const { undo: token } = await archive(ctx, [ABLE]);
		const viewer = context('view');
		await viewer.rawStore.update('personnel', viewer.auth.orgId, ABLE, { archived_at: NOW.toISOString() });

		await expect(undo(viewer, token)).rejects.toMatchObject({ status: 403 });
		expect(await archivedAt(viewer, ABLE)).toBe(NOW.toISOString());
	});

	it('issues no token when nothing was archived or requested', async () => {
		const ctx = context();

		const result = await archive(ctx, [EARLIER]);

		expect(result).toEqual({ archivedIds: [EARLIER], approvalRequestedIds: [], errors: [] });
	});
});

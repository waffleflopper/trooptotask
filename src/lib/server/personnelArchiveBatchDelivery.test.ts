import { describe, it, expect, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { archivePersonnelBatch as deliverArchivePersonnelBatch } from './personnelArchiveBatchDelivery';
import { createDeletionRequestTestStore } from '$features/deletion-requests/testing.server';

const archivePersonnelBatch = (
	ctx: ReturnType<typeof createTestContext>,
	input: Parameters<typeof deliverArchivePersonnelBatch>[1]
) => deliverArchivePersonnelBatch(ctx, input, createDeletionRequestTestStore(ctx.store));
type TestDataStore = ReturnType<typeof createTestContext>['store'];

function memberWith(personnel: 'view' | 'operate' | 'configure', groupIds?: string[]) {
	return {
		auth: {
			role: 'member' as const,
			isPrivileged: false,
			capabilityMap: {
				calendar: 'view' as const,
				personnel,
				training: 'view' as const,
				criticalTasks: 'view' as const,
				onboarding: 'view' as const,
				ratingScheme: 'view' as const
			},
			...(groupIds ? { scopeSet: { kind: 'groups' as const, groupIds } } : {})
		}
	};
}

function seedPersonnel(ctx: ReturnType<typeof createTestContext>, archivedAt: string | null = null) {
	const rows = [
		{
			id: 'p-1',
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			group_id: 'alpha',
			archived_at: archivedAt,
			organization_id: ctx.auth.orgId
		},
		{
			id: 'p-2',
			rank: 'SSG',
			last_name: 'Jones',
			first_name: 'Pat',
			group_id: 'alpha',
			archived_at: archivedAt,
			organization_id: ctx.auth.orgId
		}
	];
	ctx.rawStore.seed('personnel', structuredClone(rows));
	return rows;
}

describe('Personnel — archive batch', () => {
	it('acknowledges an empty batch without reading candidates or producing effects', async () => {
		const ctx = createTestContext();
		ctx.store = {
			...ctx.store,
			async findMany() {
				throw new Error('Empty archive must not read candidates');
			}
		};
		const archive = vi.spyOn(ctx.personnelLifecycle, 'archive');
		await expect(archivePersonnelBatch(ctx, { ids: [], userEmail: 'manager@example.com' })).resolves.toEqual({
			archivedIds: [],
			approvalRequestedIds: [],
			errors: []
		});
		expect(archive).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
		await expect(ctx.rawStore.findMany('deletion_requests', ctx.auth.orgId)).resolves.toEqual([]);
	});

	it('archives every admitted Person through one command with one candidate read and one audit', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		const candidateRead = vi.spyOn(ctx.personnel, 'listArchiveCandidates');
		const archive = vi.spyOn(ctx.personnelLifecycle, 'archive');
		const archivedAt = '2026-09-30T14:00:00.000Z';
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date(archivedAt));
			await expect(
				archivePersonnelBatch(ctx, { ids: ['p-1', 'p-2', 'p-1', 'missing'], userEmail: 'requester@example.com' })
			).resolves.toEqual({
				archivedIds: ['p-1', 'p-2'],
				approvalRequestedIds: [],
				errors: [{ id: 'missing', message: 'Personnel not found' }]
			});
		} finally {
			vi.useRealTimers();
		}
		expect(candidateRead).toHaveBeenCalledTimes(1);
		expect(archive.mock.calls).toEqual([[['p-1', 'p-2'], archivedAt]]);
		const stored = (await ctx.rawStore.findMany('personnel', ctx.auth.orgId)) as Record<string, unknown>[];
		expect(stored.every((person) => person.archived_at === archivedAt)).toBe(true);
		expect(ctx.auditPort.events.filter((event) => event.action === 'personnel.bulk_archived')).toEqual([
			expect.objectContaining({
				resourceType: 'personnel',
				details: expect.objectContaining({ count: 2, ids: ['p-1', 'p-2'] })
			})
		]);
	});

	it('includes an archived Person in the command so its saved event is completed, not replaced', async () => {
		const ctx = createTestContext();
		const rows = seedPersonnel(ctx);
		const savedEvent = '2026-08-01T12:00:00.000Z';
		await ctx.rawStore.update('personnel', ctx.auth.orgId, 'p-2', { archived_at: savedEvent });
		const archive = vi.spyOn(ctx.personnelLifecycle, 'archive');
		await expect(
			archivePersonnelBatch(ctx, { ids: ['p-1', 'p-2'], userEmail: 'manager@example.com' })
		).resolves.toEqual({ archivedIds: ['p-1', 'p-2'], approvalRequestedIds: [], errors: [] });
		expect(archive).toHaveBeenCalledWith(['p-1', 'p-2'], expect.any(String));
		expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-2' })).toEqual({
			...rows[1],
			archived_at: savedEvent
		});
	});

	it.each([
		['rejects the command', new Error('Personnel archive failed')],
		['does not acknowledge the command', new Error('Personnel archive was not acknowledged')]
	])('archives nobody and reports no success when the database %s', async (_case, failure) => {
		const ctx = createTestContext();
		const rows = seedPersonnel(ctx);
		const archive = vi.fn(async () => {
			throw failure;
		});
		ctx.personnelLifecycle.archive = archive;
		await expect(archivePersonnelBatch(ctx, { ids: ['p-1', 'p-2'], userEmail: 'manager@example.com' })).rejects.toThrow(
			failure.message
		);
		expect(archive).toHaveBeenCalledTimes(1);
		expect(await ctx.rawStore.findMany('personnel', ctx.auth.orgId)).toEqual(rows);
		expect(ctx.auditPort.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.bulk_archived' }));
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('submits an approval request per Person when direct archive requires approval', async () => {
		const ctx = createTestContext(memberWith('operate'));
		const rows = seedPersonnel(ctx);
		const archive = vi.spyOn(ctx.personnelLifecycle, 'archive');

		await expect(
			archivePersonnelBatch(ctx, { ids: ['p-1', 'p-2'], userEmail: 'requester@example.com' })
		).resolves.toEqual({ archivedIds: [], approvalRequestedIds: ['p-1', 'p-2'], errors: [] });

		expect(archive).not.toHaveBeenCalled();
		expect(await ctx.rawStore.findMany('personnel', ctx.auth.orgId)).toEqual(rows);
		const requests = (await ctx.rawStore.findMany('deletion_requests', ctx.auth.orgId)) as Record<string, unknown>[];
		expect(requests).toEqual([
			expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-1', status: 'pending' }),
			expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-2', status: 'pending' })
		]);
	});

	it.each([false, true])(
		'acknowledges a pending duplicate and keeps independent request errors (failure: %s)',
		async (failSecond) => {
			const ctx = createTestContext(memberWith('operate'));
			const rows = seedPersonnel(ctx);
			const pending = ['pending-a', 'pending-b'].map((id) => ({
				id,
				organization_id: ctx.auth.orgId,
				resource_type: 'personnel',
				resource_id: 'p-1',
				status: 'pending'
			}));
			ctx.rawStore.seed('deletion_requests', structuredClone(pending));
			if (failSecond) {
				const insert = ctx.store.insert.bind(ctx.store);
				ctx.store.insert = async <T>(...args: Parameters<TestDataStore['insert']>) => {
					if (args[0] === 'deletion_requests') throw new Error('request write interrupted');
					return insert<T>(...args);
				};
			}
			await expect(
				archivePersonnelBatch(ctx, { ids: ['p-1', 'p-2'], userEmail: 'operator@example.com' })
			).resolves.toEqual({
				archivedIds: [],
				approvalRequestedIds: failSecond ? ['p-1'] : ['p-1', 'p-2'],
				errors: failSecond ? [{ id: 'p-2', message: 'request write interrupted' }] : []
			});
			const requests = await ctx.rawStore.findMany('deletion_requests', ctx.auth.orgId);
			expect(requests.slice(0, 2)).toEqual(pending);
			expect(requests).toHaveLength(failSecond ? 2 : 3);
			expect(await ctx.rawStore.findMany('personnel', ctx.auth.orgId)).toEqual(rows);
		}
	);

	it.each(['view', 'operate'] as const)(
		'denies archived replay for %s without requesting approval or archiving',
		async (capability) => {
			const ctx = createTestContext(memberWith(capability));
			const rows = seedPersonnel(ctx, '2026-09-30T14:00:00.000Z');
			const archive = vi.spyOn(ctx.personnelLifecycle, 'archive');
			await expect(archivePersonnelBatch(ctx, { ids: ['p-1'], userEmail: 'member@example.com' })).resolves.toEqual({
				archivedIds: [],
				approvalRequestedIds: [],
				errors: [{ id: 'p-1', message: 'Personnel is already archived' }]
			});
			expect(archive).not.toHaveBeenCalled();
			expect(await ctx.rawStore.findMany('personnel', ctx.auth.orgId)).toEqual(rows);
			expect(await ctx.rawStore.findMany('deletion_requests', ctx.auth.orgId)).toEqual([]);
			expect(ctx.auditPort.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.bulk_archived' }));
		}
	);

	it('admits only in-scope People and conceals Group and foreign targets', async () => {
		const ctx = createTestContext(memberWith('configure', ['alpha']));
		seedPersonnel(ctx);
		await ctx.rawStore.update('personnel', ctx.auth.orgId, 'p-2', { group_id: 'bravo' });
		const other = structuredClone(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-2' }));
		const foreign = {
			id: 'foreign',
			organization_id: 'other-org',
			group_id: 'alpha',
			archived_at: null,
			rank: 'SGT',
			last_name: 'Foreign',
			first_name: 'Person'
		};
		ctx.rawStore.seed('personnel', [structuredClone(foreign)]);
		const archive = vi.spyOn(ctx.personnelLifecycle, 'archive');
		await expect(
			archivePersonnelBatch(ctx, { ids: ['p-1', 'p-2', 'foreign'], userEmail: 'scoped@example.com' })
		).resolves.toEqual({
			archivedIds: ['p-1'],
			approvalRequestedIds: [],
			errors: [
				{ id: 'p-2', message: 'Personnel not found' },
				{ id: 'foreign', message: 'Personnel not found' }
			]
		});
		expect(archive).toHaveBeenCalledWith(['p-1'], expect.any(String));
		expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-2' })).toEqual(other);
		expect(await ctx.rawStore.findOne('personnel', 'other-org', { id: 'foreign' })).toEqual(foreign);
	});
});

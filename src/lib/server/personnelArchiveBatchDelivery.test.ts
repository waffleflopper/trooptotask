import { describe, it, expect, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { restorePersonnelRecord } from '$features/personnel/index.server';
import { archivePersonnelBatch as deliverArchivePersonnelBatch } from './personnelArchiveBatchDelivery';
import { createSupabaseDeletionRequestStore } from '$features/deletion-requests/index.server';
import {
	createDeletionRequestTestStore,
	deletionRequestTestProvider,
	savedRequest
} from '$features/deletion-requests/testing.server';

const archivePersonnelBatch = (
	ctx: ReturnType<typeof createTestContext>,
	input: Parameters<typeof deliverArchivePersonnelBatch>[1]
) => deliverArchivePersonnelBatch(ctx, input, createDeletionRequestTestStore(ctx.store));
type TestDataStore = ReturnType<typeof createTestContext>['store'];

function freshCopies(store: TestDataStore): TestDataStore {
	return {
		...store,
		async findOne<T>(...args: Parameters<TestDataStore['findOne']>) {
			return structuredClone(await store.findOne<T>(...args));
		},
		async findMany<T>(...args: Parameters<TestDataStore['findMany']>) {
			return structuredClone(await store.findMany<T>(...args));
		},
		async update<T>(...args: Parameters<TestDataStore['update']>) {
			return structuredClone(await store.update<T>(...args));
		}
	};
}

describe('Personnel — archive batch', () => {
	it('acknowledges an already-pending target with multiple visible rows without creating requests or archiving', async () => {
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
		const person = { id: 'person', organization_id: ctx.auth.orgId, group_id: null, archived_at: null };
		ctx.store.seed('personnel', [person]);
		const rows = ['first', 'second'].map((id) =>
			savedRequest(id, {
				organization_id: ctx.auth.orgId,
				requested_by: ctx.auth.userId,
				resource_type: 'personnel',
				resource_id: person.id
			})
		);
		const provider = deletionRequestTestProvider(rows, ctx.auth.userId);
		await expect(
			deliverArchivePersonnelBatch(
				ctx,
				{ ids: [person.id], userEmail: 'member@example.test' },
				createSupabaseDeletionRequestStore(provider.client)
			)
		).resolves.toEqual({ archivedIds: [], approvalRequestedIds: [person.id], errors: [] });
		expect(provider.state.rows).toEqual(rows);
		expect(provider.state.calls.every((request) => request.method === 'GET')).toBe(true);
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: person.id })).toEqual(person);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('acknowledges an empty batch without reading candidates or producing effects', async () => {
		const ctx = createTestContext();
		ctx.store = {
			...ctx.store,
			async findMany() {
				throw new Error('Empty archive must not read candidates');
			}
		};
		await expect(archivePersonnelBatch(ctx, { ids: [], userEmail: 'manager@example.com' })).resolves.toEqual({
			archivedIds: [],
			approvalRequestedIds: [],
			errors: []
		});
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
		await expect(ctx.rawStore.findMany('deletion_requests', ctx.auth.orgId)).resolves.toEqual([]);
	});
	function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			},
			{
				id: 'p-2',
				rank: 'SSG',
				last_name: 'Jones',
				first_name: 'Pat',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);
	}

	function seedPersonnelArtifacts(ctx: ReturnType<typeof createTestContext>) {
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-p1',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status: 'open',
				archived_at: null
			},
			{
				id: 'follow-up-p2',
				organization_id: 'test-org',
				personnel_id: 'p-2',
				status: 'open',
				archived_at: null
			}
		]);
		ctx.store.seed('counseling_records', [
			{ id: 'counseling-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'counseling-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
		ctx.store.seed('personnel_documents', [
			{ id: 'document-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'document-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
		ctx.store.seed('leader_notes', [
			{ id: 'note-p1', organization_id: 'test-org', personnel_id: 'p-1', archived_at: null },
			{ id: 'note-p2', organization_id: 'test-org', personnel_id: 'p-2', archived_at: null }
		]);
	}

	it('archives multiple personnel through one use case call', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);

		const result = await archivePersonnelBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		expect(result).toEqual({
			archivedIds: ['p-1', 'p-2'],
			approvalRequestedIds: [],
			errors: []
		});
		const stored = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(stored.every((person) => person.archived_at)).toBe(true);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.bulk_archived',
				resourceType: 'personnel',
				details: expect.objectContaining({ count: 2, ids: ['p-1', 'p-2'] })
			})
		);
	});

	it('archives personnel-owned artifacts for every directly archived personnel record', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);

		await archivePersonnelBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		const followUps = (await ctx.store.findMany('personnel_follow_ups', 'test-org')) as Record<string, unknown>[];
		const counselings = (await ctx.store.findMany('counseling_records', 'test-org')) as Record<string, unknown>[];
		const documents = (await ctx.store.findMany('personnel_documents', 'test-org')) as Record<string, unknown>[];
		const notes = (await ctx.store.findMany('leader_notes', 'test-org')) as Record<string, unknown>[];

		expect(followUps.every((row) => row.status === 'archived' && row.archived_at)).toBe(true);
		expect(counselings.every((row) => row.archived_at)).toBe(true);
		expect(documents.every((row) => row.archived_at)).toBe(true);
		expect(notes.every((row) => row.archived_at)).toBe(true);
	});

	it('completes an already-archived event while archiving the active candidate in a mixed batch', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);
		const archivedAt = '2026-08-01T12:00:00.000Z';
		await ctx.store.update('personnel', ctx.auth.orgId, 'p-2', { archived_at: archivedAt });
		const original = structuredClone(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-2' }));
		const result = await archivePersonnelBatch(ctx, {
			ids: ['p-1', 'p-2', 'missing'],
			userEmail: 'requester@example.com'
		});
		expect(result).toEqual({
			archivedIds: ['p-1', 'p-2'],
			approvalRequestedIds: [],
			errors: [{ id: 'missing', message: 'Personnel not found' }]
		});
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-2' })).toEqual(original);
		expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-p2' })).toMatchObject({
			archived_at: archivedAt
		});
		expect(await ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toMatchObject({
			archived_at: expect.any(String)
		});
	});

	it('creates archival requests in the same call when direct archive requires approval', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				role: 'member',
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		seedPersonnel(ctx);
		seedPersonnelArtifacts(ctx);

		const result = await archivePersonnelBatch(ctx, {
			ids: ['p-1', 'p-2'],
			userEmail: 'requester@example.com'
		});

		expect(result).toEqual({
			archivedIds: [],
			approvalRequestedIds: ['p-1', 'p-2'],
			errors: []
		});
		await expect(ctx.store.findMany('leader_notes', 'test-org')).resolves.toEqual([
			expect.objectContaining({ id: 'note-p1', archived_at: null }),
			expect.objectContaining({ id: 'note-p2', archived_at: null })
		]);
		const requests = (await ctx.store.findMany('deletion_requests', 'test-org')) as Record<string, unknown>[];
		expect(requests).toHaveLength(2);
		expect(requests).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-1', status: 'pending' }),
				expect.objectContaining({ resource_type: 'personnel', resource_id: 'p-2', status: 'pending' })
			])
		);
	});
});

describe('Personnel — interrupted lifecycle recovery', () => {
	const firstEvent = '2026-09-30T14:00:00.000Z';
	const retryTime = '2026-09-30T14:05:00.000Z';
	const independentEvent = '2026-08-01T12:00:00.000Z';
	const artifactIds = [
		['personnel_follow_ups', 'open-one'],
		['counseling_records', 'counseling-one'],
		['personnel_documents', 'document-one'],
		['leader_notes', 'note-one']
	] as const;

	function context(overrides?: Parameters<typeof createTestContext>[0]) {
		const ctx = createTestContext(overrides);
		// Reads and update acknowledgements are copies, separate from persisted rows.
		ctx.store = { ...ctx.store, ...freshCopies(ctx.store) };
		ctx.rawStore = { ...ctx.rawStore, ...freshCopies(ctx.rawStore) };
		return ctx;
	}

	function seed(ctx: ReturnType<typeof context>, archivedAt: string | null = null) {
		const rows: Record<string, Record<string, unknown>[]> = {
			personnel: [
				{
					id: 'one',
					organization_id: ctx.auth.orgId,
					group_id: 'alpha',
					rank: 'SPC',
					first_name: 'Alex',
					last_name: 'One',
					slug: 'one-alex',
					ets: null,
					deros: '2027-08-01',
					archived_at: archivedAt
				},
				{
					id: 'two',
					organization_id: ctx.auth.orgId,
					group_id: 'alpha',
					rank: 'SGT',
					first_name: 'Blair',
					last_name: 'Two',
					slug: 'two-blair',
					ets: '2027-09-01',
					deros: null,
					archived_at: archivedAt
				}
			],
			personnel_follow_ups: [
				{
					id: 'open-one',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					status: archivedAt ? 'archived' : 'open',
					archived_at: archivedAt
				},
				{
					id: 'independent-follow',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					status: 'archived',
					archived_at: independentEvent
				},
				{
					id: 'completed-one',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					status: 'completed',
					completed_at: '2026-07-01T12:00:00.000Z',
					archived_at: null
				}
			],
			counseling_records: [
				{
					id: 'counseling-one',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					file_path: 'test-org/counseling-records/one/current.pdf',
					archived_at: archivedAt
				},
				{
					id: 'independent-counseling',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					file_path: 'test-org/counseling-records/one/earlier.pdf',
					archived_at: independentEvent
				}
			],
			personnel_documents: [
				{
					id: 'document-one',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					file_path: 'test-org/personnel/one/documents/current.pdf',
					archived_at: archivedAt
				},
				{
					id: 'independent-document',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					file_path: 'test-org/personnel/one/documents/earlier.pdf',
					archived_at: independentEvent
				}
			],
			leader_notes: [
				{
					id: 'note-one',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					text: 'Current note',
					archived_at: archivedAt
				},
				{
					id: 'note-two',
					organization_id: ctx.auth.orgId,
					personnel_id: 'two',
					text: 'Second Person note',
					archived_at: archivedAt
				},
				{
					id: 'independent-note',
					organization_id: ctx.auth.orgId,
					personnel_id: 'one',
					text: 'Earlier note',
					archived_at: independentEvent
				},
				{
					id: 'note-other-person',
					organization_id: ctx.auth.orgId,
					personnel_id: 'unrelated',
					text: 'Unrelated note',
					archived_at: firstEvent
				},
				{
					id: 'note-other-org',
					organization_id: 'other-org',
					personnel_id: 'one',
					text: 'Foreign note',
					archived_at: firstEvent
				}
			]
		};
		for (const [table, tableRows] of Object.entries(rows)) ctx.rawStore.seed(table, structuredClone(tableRows));
		return rows;
	}

	async function persisted(ctx: ReturnType<typeof context>, rows: ReturnType<typeof seed>) {
		return Object.fromEntries(
			await Promise.all(
				Object.keys(rows).map(async (table) => [table, await ctx.rawStore.findMany(table, ctx.auth.orgId)])
			)
		);
	}

	async function expectArtifacts(ctx: ReturnType<typeof context>, archivedAt: string | null) {
		for (const [table, id] of artifactIds) {
			expect(await ctx.rawStore.findOne(table, ctx.auth.orgId, { id })).toMatchObject({
				id,
				personnel_id: 'one',
				archived_at: archivedAt
			});
		}
		expect(await ctx.rawStore.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'open-one' })).toMatchObject({
			status: archivedAt ? 'archived' : 'open'
		});
	}

	async function expectIndependent(ctx: ReturnType<typeof context>, rows: ReturnType<typeof seed>) {
		for (const [table, tableRows] of Object.entries(rows)) {
			for (const row of tableRows.filter(
				(row) =>
					String(row.id).startsWith('independent-') ||
					String(row.id).startsWith('note-other-') ||
					row.id === 'completed-one'
			)) {
				expect(await ctx.rawStore.findOne(table, String(row.organization_id), { id: row.id })).toEqual(row);
			}
		}
	}

	function failNoteOnce(ctx: ReturnType<typeof context>) {
		const writes = ctx.personnelArtifactWrites!;
		const bind = writes.forPeople.bind(writes);
		let pending = true;
		writes.forPeople = async (...args) => {
			const writer = await bind(...args);
			return {
				...writer,
				async update(table, row, patch) {
					if (row.id === 'note-one' && pending) {
						pending = false;
						throw new Error('note write interrupted');
					}
					await writer.update(table, row, patch);
				}
			};
		};
	}

	it('recovers an acknowledged parent under its first event after the second parent write fails', async () => {
		const ctx = context();
		const rows = seed(ctx);
		const update = ctx.store.update.bind(ctx.store);
		let pending = true;
		ctx.store.update = async <T>(...args: Parameters<TestDataStore['update']>) => {
			if (args[0] === 'personnel' && args[2] === 'two' && pending) {
				pending = false;
				throw new Error('second parent write interrupted');
			}
			return update<T>(...args);
		};
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date(firstEvent));
			await expect(
				archivePersonnelBatch(ctx, { ids: ['one', 'two'], userEmail: 'manager@example.com' })
			).rejects.toThrow('second parent write interrupted');
			expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'one' })).toEqual({
				...rows.personnel[0],
				archived_at: firstEvent
			});
			expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'two' })).toEqual(rows.personnel[1]);
			expect(ctx.auditPort.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.bulk_archived' }));
			vi.setSystemTime(new Date(retryTime));
			const cascade = vi.spyOn(ctx.personnelArtifactWrites!, 'forPeople');
			await expect(
				archivePersonnelBatch(ctx, { ids: ['one', 'two'], userEmail: 'manager@example.com' })
			).resolves.toEqual({ archivedIds: ['one', 'two'], approvalRequestedIds: [], errors: [] });
			expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'one' })).toEqual({
				...rows.personnel[0],
				archived_at: firstEvent
			});
			expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'two' })).toEqual({
				...rows.personnel[1],
				archived_at: retryTime
			});
			await expectArtifacts(ctx, firstEvent);
			expect(await ctx.rawStore.findOne('leader_notes', ctx.auth.orgId, { id: 'note-two' })).toMatchObject({
				archived_at: retryTime
			});
			expect(cascade).toHaveBeenCalledTimes(2);
			await expectIndependent(ctx, rows);
		} finally {
			vi.useRealTimers();
		}
	});

	it('completes a late failed bulk cascade on replay and restores only that event', async () => {
		const ctx = context();
		const rows = seed(ctx);
		failNoteOnce(ctx);
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date(firstEvent));
			await expect(
				archivePersonnelBatch(ctx, { ids: ['one', 'two'], userEmail: 'manager@example.com' })
			).rejects.toThrow('note write interrupted');
			expect(await ctx.rawStore.findOne('personnel_documents', ctx.auth.orgId, { id: 'document-one' })).toMatchObject({
				archived_at: firstEvent
			});
			expect(await ctx.rawStore.findOne('leader_notes', ctx.auth.orgId, { id: 'note-one' })).toEqual(
				rows.leader_notes[0]
			);
			expect(ctx.auditPort.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.bulk_archived' }));
			vi.setSystemTime(new Date(retryTime));
			const candidateRead = vi.spyOn(ctx.store, 'findMany');
			const cascade = vi.spyOn(ctx.personnelArtifactWrites!, 'forPeople');
			await expect(
				archivePersonnelBatch(ctx, { ids: ['one', 'two', 'one'], userEmail: 'manager@example.com' })
			).resolves.toEqual({ archivedIds: ['one', 'two'], approvalRequestedIds: [], errors: [] });
			expect(candidateRead).toHaveBeenCalledTimes(1);
			expect(cascade).toHaveBeenCalledTimes(1);
			for (const row of rows.personnel)
				expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: row.id })).toEqual({
					...row,
					archived_at: firstEvent
				});
			await expectArtifacts(ctx, firstEvent);
			expect(await ctx.rawStore.findOne('leader_notes', ctx.auth.orgId, { id: 'note-two' })).toMatchObject({
				archived_at: firstEvent
			});
			await restorePersonnelRecord(ctx, 'one');
			await restorePersonnelRecord(ctx, 'two');
			for (const row of rows.personnel)
				expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: row.id })).toEqual(row);
			await expectArtifacts(ctx, null);
			expect(await ctx.rawStore.findOne('leader_notes', ctx.auth.orgId, { id: 'note-two' })).toMatchObject({
				archived_at: null
			});
			await expectIndependent(ctx, rows);
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps healthy bulk deduplicated with one candidate read and one event cascade', async () => {
		const ctx = context();
		const rows = seed(ctx);
		const candidateRead = vi.spyOn(ctx.store, 'findMany');
		const cascade = vi.spyOn(ctx.personnelArtifactWrites!, 'forPeople');
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date(firstEvent));
			await expect(
				archivePersonnelBatch(ctx, {
					ids: ['one', 'two', 'one', 'missing'],
					userEmail: 'manager@example.com'
				})
			).resolves.toEqual({
				archivedIds: ['one', 'two'],
				approvalRequestedIds: [],
				errors: [{ id: 'missing', message: 'Personnel not found' }]
			});
			expect(candidateRead).toHaveBeenCalledTimes(1);
			expect(cascade).toHaveBeenCalledTimes(1);
			for (const row of rows.personnel)
				expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: row.id })).toEqual({
					...row,
					archived_at: firstEvent
				});
			await expectArtifacts(ctx, firstEvent);
			await expectIndependent(ctx, rows);
		} finally {
			vi.useRealTimers();
		}
	});

	it.each(['artifact', 'parent'] as const)('retains restore retry information after a %s failure', async (failure) => {
		const ctx = context();
		const rows = seed(ctx, firstEvent);
		if (failure === 'artifact') failNoteOnce(ctx);
		else {
			const update = ctx.store.update.bind(ctx.store);
			let pending = true;
			ctx.store.update = async <T>(...args: Parameters<TestDataStore['update']>) => {
				if (args[0] === 'personnel' && args[2] === 'one' && pending) {
					pending = false;
					throw new Error('parent clear interrupted');
				}
				return update<T>(...args);
			};
		}
		await expect(restorePersonnelRecord(ctx, 'one')).rejects.toThrow(
			failure === 'artifact' ? 'note write interrupted' : 'parent clear interrupted'
		);
		expect.soft(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'one' })).toEqual(rows.personnel[0]);
		expect(ctx.auditPort.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.restored' }));
		await expect(restorePersonnelRecord(ctx, 'one')).resolves.toEqual({ success: true });
		expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'one' })).toEqual({
			...rows.personnel[0],
			archived_at: null
		});
		expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'two' })).toEqual(rows.personnel[1]);
		await expectArtifacts(ctx, null);
		expect(await ctx.rawStore.findOne('leader_notes', ctx.auth.orgId, { id: 'note-two' })).toEqual(
			rows.leader_notes.find((row) => row.id === 'note-two')
		);
		await expectIndependent(ctx, rows);
		expect(ctx.auditPort.events.filter((event) => event.action === 'personnel.restored')).toHaveLength(1);
	});

	it.each(['view', 'operate'] as const)(
		'denies archived replay for %s without requesting approval or changing artifacts',
		async (capability) => {
			const ctx = context({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'view',
						personnel: capability,
						training: 'view',
						criticalTasks: 'view',
						onboarding: 'view',
						ratingScheme: 'view'
					}
				}
			});
			const rows = seed(ctx, firstEvent);
			await ctx.rawStore.update('leader_notes', ctx.auth.orgId, 'note-one', { archived_at: null });
			const before = await persisted(ctx, rows);
			await expect(archivePersonnelBatch(ctx, { ids: ['one'], userEmail: 'member@example.com' })).resolves.toEqual({
				archivedIds: [],
				approvalRequestedIds: [],
				errors: [{ id: 'one', message: 'Personnel is already archived' }]
			});
			expect(await persisted(ctx, rows)).toEqual(before);
			expect(await ctx.rawStore.findMany('deletion_requests', ctx.auth.orgId)).toEqual([]);
			expect(ctx.auditPort.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.bulk_archived' }));
		}
	);

	it('repairs only in-scope archived candidates and conceals Group and foreign targets', async () => {
		const ctx = context({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			}
		});
		const rows = seed(ctx, firstEvent);
		await ctx.rawStore.update('leader_notes', ctx.auth.orgId, 'note-one', { archived_at: null });
		await ctx.rawStore.update('leader_notes', ctx.auth.orgId, 'note-two', { archived_at: null });
		await ctx.rawStore.update('personnel', ctx.auth.orgId, 'two', { group_id: 'bravo' });
		const other = structuredClone(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'two' }));
		const foreign = {
			id: 'foreign',
			organization_id: 'other-org',
			group_id: 'alpha',
			archived_at: firstEvent,
			rank: 'SGT',
			last_name: 'Foreign',
			first_name: 'Person'
		};
		ctx.rawStore.seed('personnel', [structuredClone(foreign)]);
		await expect(
			archivePersonnelBatch(ctx, { ids: ['one', 'two', 'foreign'], userEmail: 'scoped@example.com' })
		).resolves.toEqual({
			archivedIds: ['one'],
			approvalRequestedIds: [],
			errors: [
				{ id: 'two', message: 'Personnel not found' },
				{ id: 'foreign', message: 'Personnel not found' }
			]
		});
		expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'one' })).toEqual(rows.personnel[0]);
		expect(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'two' })).toEqual(other);
		expect(await ctx.rawStore.findOne('personnel', 'other-org', { id: 'foreign' })).toEqual(foreign);
		expect(await ctx.rawStore.findOne('leader_notes', ctx.auth.orgId, { id: 'note-two' })).toMatchObject({
			archived_at: null
		});
		await expectArtifacts(ctx, firstEvent);
		await expectIndependent(ctx, rows);
	});

	it.each([false, true])(
		'retains pending 409 acknowledgement and independent request errors (failure: %s)',
		async (failSecond) => {
			const ctx = context({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'view',
						personnel: 'operate',
						training: 'view',
						criticalTasks: 'view',
						onboarding: 'view',
						ratingScheme: 'view'
					}
				}
			});
			const rows = seed(ctx);
			const before = await persisted(ctx, rows);
			const pending = {
				id: 'pending-one',
				organization_id: ctx.auth.orgId,
				resource_type: 'personnel',
				resource_id: 'one',
				status: 'pending'
			};
			ctx.rawStore.seed('deletion_requests', [structuredClone(pending)]);
			if (failSecond) {
				const insert = ctx.store.insert.bind(ctx.store);
				ctx.store.insert = async <T>(...args: Parameters<TestDataStore['insert']>) => {
					if (args[0] === 'deletion_requests') throw new Error('request write interrupted');
					return insert<T>(...args);
				};
			}
			await expect(
				archivePersonnelBatch(ctx, { ids: ['one', 'two'], userEmail: 'operator@example.com' })
			).resolves.toEqual({
				archivedIds: [],
				approvalRequestedIds: failSecond ? ['one'] : ['one', 'two'],
				errors: failSecond ? [{ id: 'two', message: 'request write interrupted' }] : []
			});
			expect(await ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'pending-one' })).toEqual(pending);
			expect(await ctx.rawStore.findMany('deletion_requests', ctx.auth.orgId)).toHaveLength(failSecond ? 1 : 2);
			expect(await persisted(ctx, rows)).toEqual(before);
		}
	);
});

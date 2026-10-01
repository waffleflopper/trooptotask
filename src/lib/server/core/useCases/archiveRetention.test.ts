import type { PersonnelRetentionSource } from '$features/personnel/index.server';
import { bindLeaderNoteDataSource } from '$lib/server/adapters/leaderNoteDataSource';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryDataStore, createTestStoragePort } from '$lib/server/adapters/inMemory';
import { cleanupArchivedRecords } from './archiveRetention';
import { COUNSELING_RECORDS_BUCKET } from './personnelCounselingRecords';
import { PERSONNEL_DOCUMENTS_BUCKET } from './personnelDocuments';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';

const NOW = new Date('2026-05-30T12:00:00.000Z');

function buildPorts() {
	const store = createInMemoryDataStore();
	const storage = createTestStoragePort();
	const assignmentTypes = {
		async deleteExpiredUnreferenced(orgId: string, ids: string[], cutoff: string): Promise<number> {
			const candidates = await store.findMany<{ id: string }>('assignment_types', orgId, undefined, {
				inFilters: { id: ids },
				rangeFilters: [{ column: 'archived_at', op: 'lt', value: cutoff }],
				isNull: { archived_at: false }
			});
			const references = await store.findMany<{ assignment_type_id: string }>('daily_assignments', orgId, undefined, {
				inFilters: { assignment_type_id: candidates.map((row) => row.id) }
			});
			const referencedIds = new Set(references.map((row) => row.assignment_type_id));
			return store.deleteManyByIds(
				'assignment_types',
				orgId,
				candidates.map((row) => row.id).filter((id) => !referencedIds.has(id))
			);
		}
	};

	return {
		store,
		storage,
		assignmentTypes,
		personnel: { deleteExpired: vi.fn<PersonnelRetentionSource['deleteExpired']>().mockResolvedValue(0) },
		notifications: { notifyAdmins: vi.fn<NotificationDeliveryPort['notifyAdmins']>().mockResolvedValue(undefined) },
		leaderNotes: bindLeaderNoteDataSource(store)
	};
}

function isoMonthsAgo(months: number): string {
	const date = new Date(NOW);
	date.setMonth(date.getMonth() - months);
	return date.toISOString();
}

function seedRetentionRows(ports: ReturnType<typeof buildPorts>) {
	const expired = isoMonthsAgo(13);
	const recent = isoMonthsAgo(3);
	ports.personnel.deleteExpired.mockResolvedValue(1);

	ports.store.seed('personnel_follow_ups', [
		{ id: 'follow-up-expired', organization_id: 'org-1', status: 'archived', archived_at: expired },
		{ id: 'follow-up-recent', organization_id: 'org-1', status: 'archived', archived_at: recent },
		{ id: 'follow-up-active', organization_id: 'org-1', status: 'open', archived_at: null }
	]);
	ports.store.seed('counseling_records', [
		{
			id: 'counseling-expired',
			organization_id: 'org-1',
			file_path: 'org-1/counseling-records/person-1/expired.pdf',
			archived_at: expired
		},
		{
			id: 'counseling-recent',
			organization_id: 'org-1',
			file_path: 'org-1/counseling-records/person-1/recent.pdf',
			archived_at: recent
		},
		{ id: 'counseling-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.store.seed('personnel_documents', [
		{
			id: 'document-expired',
			organization_id: 'org-1',
			file_path: 'org-1/personnel/person-1/documents/expired.pdf',
			archived_at: expired
		},
		{
			id: 'document-recent',
			organization_id: 'org-1',
			file_path: 'org-1/personnel/person-1/documents/recent.pdf',
			archived_at: recent
		},
		{
			id: 'document-active',
			organization_id: 'org-1',
			file_path: 'org-1/personnel/person-1/documents/active.pdf',
			archived_at: null
		}
	]);
	ports.store.seed('leader_notes', [
		{ id: 'note-expired', organization_id: 'org-1', archived_at: expired },
		{ id: 'note-recent', organization_id: 'org-1', archived_at: recent },
		{ id: 'note-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.store.seed('ict_tasks', [
		{ id: 'ict-expired', organization_id: 'org-1', archived_at: expired },
		{ id: 'ict-recent', organization_id: 'org-1', archived_at: recent },
		{ id: 'ict-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.store.seed('assignment_types', [
		{ id: 'assignment-expired', organization_id: 'org-1', archived_at: expired },
		{ id: 'assignment-recent', organization_id: 'org-1', archived_at: recent },
		{ id: 'assignment-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.storage.files.push(
		{
			bucket: PERSONNEL_DOCUMENTS_BUCKET,
			path: 'org-1/personnel/person-1/documents/expired.pdf',
			data: new ArrayBuffer(1)
		},
		{
			bucket: PERSONNEL_DOCUMENTS_BUCKET,
			path: 'org-1/personnel/person-1/documents/recent.pdf',
			data: new ArrayBuffer(1)
		},
		{
			bucket: COUNSELING_RECORDS_BUCKET,
			path: 'org-1/counseling-records/person-1/expired.pdf',
			data: new ArrayBuffer(1)
		},
		{
			bucket: COUNSELING_RECORDS_BUCKET,
			path: 'org-1/counseling-records/person-1/recent.pdf',
			data: new ArrayBuffer(1)
		}
	);
}

async function idsFor(ports: ReturnType<typeof buildPorts>, table: string): Promise<string[]> {
	const rows = await ports.store.findMany<{ id: string }>(table, 'org-1');
	return rows.map((row) => row.id).sort();
}

describe('cleanupArchivedRecords', () => {
	it('retains cutoff-equal and foreign artifacts plus unarchived completed Follow-up history', async () => {
		const ports = buildPorts();
		const cutoff = '2025-05-30T12:00:00.000Z';
		const expired = '2025-05-30T11:59:59.999Z';
		for (const table of ['personnel_follow_ups', 'counseling_records', 'personnel_documents', 'leader_notes']) {
			ports.store.seed(table, [
				{
					id: 'expired',
					organization_id: 'org-1',
					personnel_id: 'active-parent',
					archived_at: expired,
					status: 'archived'
				},
				{
					id: 'cutoff-equal',
					organization_id: 'org-1',
					personnel_id: 'active-parent',
					archived_at: cutoff,
					status: 'archived'
				},
				{
					id: 'foreign-expired',
					organization_id: 'org-2',
					personnel_id: 'foreign-parent',
					archived_at: expired,
					status: 'archived'
				}
			]);
		}
		await ports.store.insert('personnel_follow_ups', 'org-1', {
			id: 'completed-history',
			personnel_id: 'active-parent',
			status: 'completed',
			completed_at: expired,
			archived_at: null
		});
		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });
		expect(result.deletedCount).toBe(4);
		for (const table of ['counseling_records', 'personnel_documents', 'leader_notes'])
			await expect(idsFor(ports, table)).resolves.toEqual(['cutoff-equal']);
		await expect(idsFor(ports, 'personnel_follow_ups')).resolves.toEqual(['completed-history', 'cutoff-equal']);
		for (const table of ['personnel_follow_ups', 'counseling_records', 'personnel_documents', 'leader_notes'])
			expect(await ports.store.findMany<{ id: string }>(table, 'org-2')).toEqual([
				expect.objectContaining({ id: 'foreign-expired', archived_at: expired })
			]);
	});

	it('deletes expired archived rows and retains recent or active rows for every archive family', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(7);
		expect(result.orgsAffected).toBe(1);
		expect(result.families).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'personnel', deletedCount: 1 }),
				expect.objectContaining({ key: 'personnel-follow-ups', deletedCount: 1 }),
				expect.objectContaining({ key: 'counseling-records', deletedCount: 1 }),
				expect.objectContaining({ key: 'personnel-documents', deletedCount: 1 }),
				expect.objectContaining({ key: 'leader-notes', deletedCount: 1 }),
				expect.objectContaining({ key: 'critical-tasks', deletedCount: 1 }),
				expect.objectContaining({ key: 'assignment-types', deletedCount: 1 })
			])
		);

		await expect(idsFor(ports, 'personnel_follow_ups')).resolves.toEqual(['follow-up-active', 'follow-up-recent']);
		await expect(idsFor(ports, 'counseling_records')).resolves.toEqual(['counseling-active', 'counseling-recent']);
		await expect(idsFor(ports, 'personnel_documents')).resolves.toEqual(['document-active', 'document-recent']);
		await expect(idsFor(ports, 'leader_notes')).resolves.toEqual(['note-active', 'note-recent']);
		await expect(idsFor(ports, 'ict_tasks')).resolves.toEqual(['ict-active', 'ict-recent']);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['assignment-active', 'assignment-recent']);
	});

	it('stops before deleting Personnel or reporting success when note deletion fails', async () => {
		const ports = buildPorts();
		ports.store.seed('leader_notes', [{ id: 'note', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00Z' }]);
		const deleteMany = ports.store.deleteManyByIds.bind(ports.store);
		vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation((table, orgId, ids) => {
			if (table === 'leader_notes') throw new Error('Note deletion unavailable');
			return deleteMany(table, orgId, ids);
		});
		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'Note deletion unavailable'
		);
		expect(ports.personnel.deleteExpired).not.toHaveBeenCalled();
		await expect(idsFor(ports, 'leader_notes')).resolves.toEqual(['note']);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('removes expired document and counseling files while retaining recent files', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(ports.storage.files).toEqual([
			expect.objectContaining({
				bucket: PERSONNEL_DOCUMENTS_BUCKET,
				path: 'org-1/personnel/person-1/documents/recent.pdf'
			}),
			expect.objectContaining({
				bucket: COUNSELING_RECORDS_BUCKET,
				path: 'org-1/counseling-records/person-1/recent.pdf'
			})
		]);
	});

	it('keeps storage files when database deletion fails', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);
		const deleteManyByIds = ports.store.deleteManyByIds.bind(ports.store);
		vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation(async (table, orgId, ids) => {
			if (table === 'personnel_documents') {
				throw new Error('database delete failed');
			}
			return deleteManyByIds(table, orgId, ids);
		});

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'database delete failed'
		);

		expect(ports.storage.files).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					bucket: PERSONNEL_DOCUMENTS_BUCKET,
					path: 'org-1/personnel/person-1/documents/expired.pdf'
				})
			])
		);
	});

	it('dispatches parent retention after notes and uses its actual count in the summary', async () => {
		const ports = buildPorts();
		ports.store.seed('leader_notes', [{ id: 'expired-note', organization_id: 'org-1', archived_at: isoMonthsAgo(13) }]);
		ports.personnel.deleteExpired.mockImplementation(async () => {
			expect(await idsFor(ports, 'leader_notes')).toEqual([]);
			return 2;
		});
		const findMany = ports.store.findMany.bind(ports.store);
		vi.spyOn(ports.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table === 'personnel') throw new Error('Parent persistence belongs to its source');
			return findMany(table, orgId, filters, options);
		});

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(3);
		expect(result.families).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'leader-notes', deletedCount: 1 }),
				expect.objectContaining({ key: 'personnel', deletedCount: 2 })
			])
		);
		expect(ports.notifications.notifyAdmins.mock.calls[0][2].message).toContain('Personnel: 2');
	});

	it('propagates parent retention failure without running later families or notifying administrators', async () => {
		const ports = buildPorts();
		ports.store.seed('ict_tasks', [{ id: 'expired-task', organization_id: 'org-1', archived_at: isoMonthsAgo(13) }]);
		ports.personnel.deleteExpired.mockRejectedValue(new Error('parent cleanup unavailable'));

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'parent cleanup unavailable'
		);

		await expect(idsFor(ports, 'ict_tasks')).resolves.toEqual(['expired-task']);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('retains expired assignment types used by saved Calendar assignments without Duty storage', async () => {
		const ports = buildPorts();
		const expired = isoMonthsAgo(13);
		ports.store.seed('assignment_types', [
			{ id: 'person-type', organization_id: 'org-1', archived_at: expired },
			{ id: 'group-type', organization_id: 'org-1', archived_at: expired },
			{ id: 'unused-type', organization_id: 'org-1', archived_at: expired },
			{ id: 'foreign-type', organization_id: 'org-2', archived_at: expired }
		]);
		ports.store.seed('daily_assignments', [
			{
				id: 'saved-person-assignment',
				organization_id: 'org-1',
				assignment_type_id: 'person-type',
				date: '2025-01-02',
				assignee_id: 'person-1'
			},
			{
				id: 'saved-group-assignment',
				organization_id: 'org-1',
				assignment_type_id: 'group-type',
				date: '2025-01-03',
				assignee_id: 'group-1'
			}
		]);
		const findMany = ports.store.findMany.bind(ports.store);
		vi.spyOn(ports.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table.startsWith('duty_')) throw new Error('Duty storage is unavailable');
			return findMany(table, orgId, filters, options);
		});
		const deleteManyByIds = ports.store.deleteManyByIds.bind(ports.store);
		vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation((table, orgId, ids) => {
			if (table.startsWith('duty_')) throw new Error('Duty storage is unavailable');
			return deleteManyByIds(table, orgId, ids);
		});

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.families).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'assignment-types', deletedCount: 1 })])
		);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['group-type', 'person-type']);
		await expect(ports.store.findMany('assignment_types', 'org-2')).resolves.toEqual([
			expect.objectContaining({ id: 'foreign-type' })
		]);
		const savedAssignments = await ports.store.findMany('daily_assignments', 'org-1');
		expect(savedAssignments).toHaveLength(2);
		expect(savedAssignments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'saved-person-assignment',
					assignment_type_id: 'person-type',
					date: '2025-01-02',
					assignee_id: 'person-1'
				}),
				expect.objectContaining({
					id: 'saved-group-assignment',
					assignment_type_id: 'group-type',
					date: '2025-01-03',
					assignee_id: 'group-1'
				})
			])
		);
	});

	it('does not delete an archived assignment type when Calendar references cannot be checked', async () => {
		const ports = buildPorts();
		ports.store.seed('assignment_types', [
			{ id: 'possibly-referenced', organization_id: 'org-1', archived_at: isoMonthsAgo(13) }
		]);
		const findMany = ports.store.findMany.bind(ports.store);
		vi.spyOn(ports.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table === 'daily_assignments') throw new Error('Calendar reference check unavailable');
			return findMany(table, orgId, filters, options);
		});

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'Calendar reference check unavailable'
		);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['possibly-referenced']);
	});

	it('skips archived critical tasks that still have completion history', async () => {
		const ports = buildPorts();
		const expired = isoMonthsAgo(13);
		ports.store.seed('ict_tasks', [
			{ id: 'task-referenced', organization_id: 'org-1', archived_at: expired },
			{ id: 'task-unreferenced', organization_id: 'org-1', archived_at: expired }
		]);
		ports.store.seed('personnel_ict_completions', [
			{ id: 'completion-1', organization_id: 'org-1', ict_task_id: 'task-referenced' }
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.families).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'critical-tasks', deletedCount: 1 })])
		);
		await expect(idsFor(ports, 'ict_tasks')).resolves.toEqual(['task-referenced']);
	});

	it('passes the default cutoff to the owner for invalid retention settings', async () => {
		const ports = buildPorts();

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 0 }], { now: NOW });

		expect(result.deletedCount).toBe(0);
		expect(ports.personnel.deleteExpired).toHaveBeenCalledExactlyOnceWith('org-1', '2023-05-30T12:00:00.000Z');
	});

	it('passes a clamped month-end cutoff to the owner', async () => {
		const ports = buildPorts();

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 1 }], {
			now: new Date('2026-03-31T12:00:00.000Z')
		});

		expect(ports.personnel.deleteExpired).toHaveBeenCalledExactlyOnceWith('org-1', '2026-02-28T12:00:00.000Z');
	});

	it('respects per-Organization retention settings', async () => {
		const ports = buildPorts();
		const eightMonthsAgo = isoMonthsAgo(8);
		ports.store.seed('ict_tasks', [
			{ id: 'org-1-task', organization_id: 'org-1', archived_at: eightMonthsAgo },
			{ id: 'org-2-task', organization_id: 'org-2', archived_at: eightMonthsAgo }
		]);

		const result = await cleanupArchivedRecords(
			ports,
			[
				{ id: 'org-1', retentionMonths: 12 },
				{ id: 'org-2', retentionMonths: 6 }
			],
			{ now: NOW }
		);

		expect(result.deletedCount).toBe(1);
		await expect(ports.store.findMany('ict_tasks', 'org-1')).resolves.toHaveLength(1);
		await expect(ports.store.findMany('ict_tasks', 'org-2')).resolves.toHaveLength(0);
	});

	it('passes the 36-month default cutoff when archive_retention_months is missing', async () => {
		const ports = buildPorts();

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: null }], { now: NOW });

		expect(ports.personnel.deleteExpired).toHaveBeenCalledExactlyOnceWith('org-1', '2023-05-30T12:00:00.000Z');
	});

	it('notifies organization admins with summary counts', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(ports.notifications.notifyAdmins).toHaveBeenCalledExactlyOnceWith(
			'org-1',
			null,
			expect.objectContaining({ type: 'archive_auto_deleted' })
		);
		const payload = ports.notifications.notifyAdmins.mock.calls[0][2];
		expect(payload.message).toContain('Personnel documents: 1');
	});

	it('does not mark an Organization affected or notify administrators for a zero parent count', async () => {
		const ports = buildPorts();

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(0);
		expect(result.orgsAffected).toBe(0);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('fails on required notification delivery after deletion and leaves the next Organization untouched', async () => {
		const ports = buildPorts();
		ports.personnel.deleteExpired.mockResolvedValue(1);
		ports.store.seed('ict_tasks', [{ id: 'org-2-expired', organization_id: 'org-2', archived_at: isoMonthsAgo(13) }]);
		ports.notifications.notifyAdmins.mockRejectedValue(new Error('administrator lookup unavailable'));

		await expect(
			cleanupArchivedRecords(
				ports,
				[
					{ id: 'org-1', retentionMonths: 12 },
					{ id: 'org-2', retentionMonths: 12 }
				],
				{ now: NOW }
			)
		).rejects.toThrow('administrator lookup unavailable');

		expect(ports.personnel.deleteExpired).toHaveBeenCalledExactlyOnceWith('org-1', '2025-05-30T12:00:00.000Z');
		await expect(ports.store.findMany('ict_tasks', 'org-2')).resolves.toEqual([
			expect.objectContaining({ id: 'org-2-expired' })
		]);
	});
});

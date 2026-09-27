import { createLeaderNoteDataSource } from '$features/personnel/index.server';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryDataStore, createTestStoragePort } from '$lib/server/adapters/inMemory';
import { cleanupArchivedRecords, DEFAULT_ARCHIVE_RETENTION_MONTHS } from './archiveRetention';
import { COUNSELING_RECORDS_BUCKET } from './personnelCounselingRecords';
import { PERSONNEL_DOCUMENTS_BUCKET } from './personnelDocuments';
import { notifyAdminsViaStore } from './retentionSupport';

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
	store.seed('organization_memberships', [
		{ id: 'membership-1', organization_id: 'org-1', user_id: 'owner-1', role: 'owner' },
		{ id: 'membership-2', organization_id: 'org-2', user_id: 'admin-2', role: 'admin' }
	]);
	return {
		store,
		storage,
		assignmentTypes,
		leaderNotes: createLeaderNoteDataSource({
			findArchivedBefore: async (orgId, cutoff) => {
				const notes = await store.findMany<{ id: string; archived_at: string | null }>('leader_notes', orgId);
				return notes.filter((note) => note.archived_at !== null && Date.parse(note.archived_at) < Date.parse(cutoff));
			},
			deleteByIds: (orgId, ids) => store.deleteManyByIds('leader_notes', orgId, ids)
		})
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

	ports.store.seed('personnel', [
		{ id: 'person-expired', organization_id: 'org-1', archived_at: expired },
		{ id: 'person-recent', organization_id: 'org-1', archived_at: recent },
		{ id: 'person-active', organization_id: 'org-1', archived_at: null }
	]);
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

		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['person-active', 'person-recent']);
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
		ports.store.seed('personnel', [{ id: 'person', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00Z' }]);
		const deleteMany = ports.store.deleteManyByIds.bind(ports.store);
		vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation((table, orgId, ids) => {
			if (table === 'leader_notes') throw new Error('Note deletion unavailable');
			return deleteMany(table, orgId, ids);
		});
		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'Note deletion unavailable'
		);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['person']);
		await expect(idsFor(ports, 'leader_notes')).resolves.toEqual(['note']);
		await expect(ports.store.findMany('notifications', 'org-1')).resolves.toEqual([]);
	});

	it('removes expired personnel document storage files before deleting document rows', async () => {
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

	it('removes storage files for personnel-owned documents that would be deleted by personnel cascades', async () => {
		const ports = buildPorts();
		const expired = isoMonthsAgo(13);
		const recent = isoMonthsAgo(3);
		ports.store.seed('personnel', [{ id: 'person-expired', organization_id: 'org-1', archived_at: expired }]);
		ports.store.seed('personnel_documents', [
			{
				id: 'document-recent',
				organization_id: 'org-1',
				personnel_id: 'person-expired',
				file_path: 'org-1/personnel/person-expired/documents/recent.pdf',
				archived_at: recent
			}
		]);
		ports.store.seed('counseling_records', [
			{
				id: 'counseling-recent',
				organization_id: 'org-1',
				personnel_id: 'person-expired',
				file_path: 'org-1/counseling-records/person-expired/recent.pdf',
				archived_at: recent
			}
		]);
		ports.storage.files.push(
			{
				bucket: PERSONNEL_DOCUMENTS_BUCKET,
				path: 'org-1/personnel/person-expired/documents/recent.pdf',
				data: new ArrayBuffer(1)
			},
			{
				bucket: COUNSELING_RECORDS_BUCKET,
				path: 'org-1/counseling-records/person-expired/recent.pdf',
				data: new ArrayBuffer(1)
			}
		);

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(ports.storage.files).toEqual([]);
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

	it('defaults invalid retention settings instead of deleting immediately', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{ id: 'old-but-inside-default', organization_id: 'org-1', archived_at: isoMonthsAgo(13) }
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 0 }], { now: NOW });

		expect(result.deletedCount).toBe(0);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['old-but-inside-default']);
	});

	it('clamps month-end cutoffs instead of rolling into the current month', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{ id: 'expired-before-cutoff', organization_id: 'org-1', archived_at: '2026-02-28T11:59:59.999Z' },
			{ id: 'retained-at-cutoff', organization_id: 'org-1', archived_at: '2026-02-28T12:00:00.000Z' },
			{ id: 'retained-after-cutoff', organization_id: 'org-1', archived_at: '2026-03-01T00:00:00.000Z' }
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 1 }], {
			now: new Date('2026-03-31T12:00:00.000Z')
		});

		expect(result.deletedCount).toBe(1);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['retained-after-cutoff', 'retained-at-cutoff']);
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

	it('defaults missing archive_retention_months to 36 months', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{
				id: 'expired-default',
				organization_id: 'org-1',
				archived_at: isoMonthsAgo(DEFAULT_ARCHIVE_RETENTION_MONTHS + 1)
			},
			{
				id: 'recent-default',
				organization_id: 'org-1',
				archived_at: isoMonthsAgo(DEFAULT_ARCHIVE_RETENTION_MONTHS - 1)
			}
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: null }], { now: NOW });

		expect(result.deletedCount).toBe(1);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['recent-default']);
	});

	it('notifies organization admins with summary counts and no record-name payload', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		const notifications = await ports.store.findMany<Record<string, unknown>>('notifications', 'org-1');
		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			user_id: 'owner-1',
			type: 'archive_auto_deleted',
			title: 'Archived Records Auto-Deleted'
		});
		expect(notifications[0].message).toContain('Personnel documents: 1');
		expect(notifications[0].message).not.toContain('Smith');
	});

	it('does not mark an organization affected or notify admins when deletes remove no rows', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{ id: 'person-expired', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00.000Z' }
		]);
		vi.spyOn(ports.store, 'deleteManyByIds').mockResolvedValue(0);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(0);
		expect(result.orgsAffected).toBe(0);
		await expect(ports.store.findMany('notifications', 'org-1')).resolves.toHaveLength(0);
	});
});

describe('retention support', () => {
	it('notifies organization admins and excludes the supplied user', async () => {
		const store = createInMemoryDataStore();
		store.seed('organization_memberships', [
			{ id: 'membership-1', organization_id: 'org-1', user_id: 'owner-1', role: 'owner' },
			{ id: 'membership-2', organization_id: 'org-1', user_id: 'admin-1', role: 'admin' },
			{ id: 'membership-3', organization_id: 'org-1', user_id: 'member-1', role: 'member' }
		]);

		await notifyAdminsViaStore(store, 'org-1', 'admin-1', {
			type: 'retention_test',
			title: 'Retention Test',
			message: 'Retention fanout test',
			link: '/org/org-1/settings'
		});

		const notifications = await store.findMany<Record<string, unknown>>('notifications', 'org-1');
		expect(notifications).toEqual([
			expect.objectContaining({
				user_id: 'owner-1',
				type: 'retention_test',
				title: 'Retention Test',
				message: 'Retention fanout test',
				link: '/org/org-1/settings'
			})
		]);
	});
});

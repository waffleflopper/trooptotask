import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore, createTestStoragePort } from '$lib/server/adapters/inMemory';
import { cleanupArchivedRecords, DEFAULT_ARCHIVE_RETENTION_MONTHS } from './archiveRetention';
import { COUNSELING_RECORDS_BUCKET } from './personnelCounselingRecords';
import { PERSONNEL_DOCUMENTS_BUCKET } from './personnelDocuments';

const NOW = new Date('2026-05-30T12:00:00.000Z');

function buildPorts() {
	const store = createInMemoryDataStore();
	const storage = createTestStoragePort();
	store.seed('organization_memberships', [
		{ id: 'membership-1', organization_id: 'org-1', user_id: 'owner-1', role: 'owner' },
		{ id: 'membership-2', organization_id: 'org-2', user_id: 'admin-2', role: 'admin' }
	]);
	return { store, storage };
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
	ports.store.seed('duty_roster_templates', [
		{ id: 'template-expired', organization_id: 'org-1', status: 'archived', archived_at: expired },
		{ id: 'template-recent', organization_id: 'org-1', status: 'archived', archived_at: recent },
		{ id: 'template-active', organization_id: 'org-1', status: 'active', archived_at: null }
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

		expect(result.deletedCount).toBe(8);
		expect(result.orgsAffected).toBe(1);
		expect(result.families).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'personnel', deletedCount: 1 }),
				expect.objectContaining({ key: 'personnel-follow-ups', deletedCount: 1 }),
				expect.objectContaining({ key: 'counseling-records', deletedCount: 1 }),
				expect.objectContaining({ key: 'personnel-documents', deletedCount: 1 }),
				expect.objectContaining({ key: 'leader-notes', deletedCount: 1 }),
				expect.objectContaining({ key: 'critical-tasks', deletedCount: 1 }),
				expect.objectContaining({ key: 'assignment-types', deletedCount: 1 }),
				expect.objectContaining({ key: 'duty-roster-templates', deletedCount: 1 })
			])
		);

		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['person-active', 'person-recent']);
		await expect(idsFor(ports, 'personnel_follow_ups')).resolves.toEqual(['follow-up-active', 'follow-up-recent']);
		await expect(idsFor(ports, 'counseling_records')).resolves.toEqual(['counseling-active', 'counseling-recent']);
		await expect(idsFor(ports, 'personnel_documents')).resolves.toEqual(['document-active', 'document-recent']);
		await expect(idsFor(ports, 'leader_notes')).resolves.toEqual(['note-active', 'note-recent']);
		await expect(idsFor(ports, 'ict_tasks')).resolves.toEqual(['ict-active', 'ict-recent']);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['assignment-active', 'assignment-recent']);
		await expect(idsFor(ports, 'duty_roster_templates')).resolves.toEqual(['template-active', 'template-recent']);
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

	it('skips archived assignment types that still have calendar or duty roster references', async () => {
		const ports = buildPorts();
		const expired = isoMonthsAgo(13);
		ports.store.seed('assignment_types', [
			{ id: 'assignment-referenced', organization_id: 'org-1', archived_at: expired },
			{ id: 'assignment-unreferenced', organization_id: 'org-1', archived_at: expired }
		]);
		ports.store.seed('daily_assignments', [
			{ id: 'daily-1', organization_id: 'org-1', assignment_type_id: 'assignment-referenced' }
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.families).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'assignment-types', deletedCount: 1 })])
		);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['assignment-referenced']);
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
});

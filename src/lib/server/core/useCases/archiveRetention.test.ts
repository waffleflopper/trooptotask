import type { PersonnelArtifactRetentionSource, PersonnelRetentionSource } from '$features/personnel/index.server';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { cleanupArchivedRecords } from './archiveRetention';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';

const NOW = new Date('2026-05-30T12:00:00.000Z');

function buildPorts() {
	const store = createInMemoryDataStore();
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
		assignmentTypes,
		personnel: { deleteExpired: vi.fn<PersonnelRetentionSource['deleteExpired']>().mockResolvedValue(0) },
		notifications: { notifyAdmins: vi.fn<NotificationDeliveryPort['notifyAdmins']>().mockResolvedValue(undefined) },
		artifacts: {
			deleteExpiredFollowUps: vi.fn<PersonnelArtifactRetentionSource['deleteExpiredFollowUps']>().mockResolvedValue(0),
			deleteExpiredCounselingRecords: vi
				.fn<PersonnelArtifactRetentionSource['deleteExpiredCounselingRecords']>()
				.mockResolvedValue(0),
			deleteExpiredDocuments: vi.fn<PersonnelArtifactRetentionSource['deleteExpiredDocuments']>().mockResolvedValue(0),
			deleteExpiredLeaderNotes: vi
				.fn<PersonnelArtifactRetentionSource['deleteExpiredLeaderNotes']>()
				.mockResolvedValue(0)
		}
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

	ports.artifacts.deleteExpiredFollowUps.mockResolvedValue(1);
	ports.artifacts.deleteExpiredCounselingRecords.mockResolvedValue(1);
	ports.artifacts.deleteExpiredDocuments.mockResolvedValue(1);
	ports.artifacts.deleteExpiredLeaderNotes.mockResolvedValue(1);

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
}

async function idsFor(ports: ReturnType<typeof buildPorts>, table: string): Promise<string[]> {
	const rows = await ports.store.findMany<{ id: string }>(table, 'org-1');
	return rows.map((row) => row.id).sort();
}

describe('cleanupArchivedRecords', () => {
	it('sums actual owned family counts and retains recent or active central rows', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);

		ports.artifacts.deleteExpiredFollowUps.mockResolvedValue(2);
		ports.artifacts.deleteExpiredCounselingRecords.mockResolvedValue(3);
		ports.artifacts.deleteExpiredDocuments.mockResolvedValue(4);
		ports.artifacts.deleteExpiredLeaderNotes.mockResolvedValue(5);
		ports.personnel.deleteExpired.mockResolvedValue(6);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(22);
		expect(result.orgsAffected).toBe(1);
		expect(result.families).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'personnel', deletedCount: 6 }),
				expect.objectContaining({ key: 'personnel-follow-ups', deletedCount: 2 }),
				expect.objectContaining({ key: 'counseling-records', deletedCount: 3 }),
				expect.objectContaining({ key: 'personnel-documents', deletedCount: 4 }),
				expect.objectContaining({ key: 'leader-notes', deletedCount: 5 }),
				expect.objectContaining({ key: 'critical-tasks', deletedCount: 1 }),
				expect.objectContaining({ key: 'assignment-types', deletedCount: 1 })
			])
		);

		await expect(idsFor(ports, 'ict_tasks')).resolves.toEqual(['ict-active', 'ict-recent']);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['assignment-active', 'assignment-recent']);
	});

	it('stops before deleting Personnel or reporting success when note deletion fails', async () => {
		const ports = buildPorts();
		ports.artifacts.deleteExpiredLeaderNotes.mockRejectedValue(new Error('Note deletion unavailable'));
		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'Note deletion unavailable'
		);
		expect(ports.personnel.deleteExpired).not.toHaveBeenCalled();
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('preserves earlier family effects and stops later work when counseling cleanup fails', async () => {
		const ports = buildPorts();
		let followUpsDeleted = false;
		ports.artifacts.deleteExpiredFollowUps.mockImplementation(async () => {
			followUpsDeleted = true;
			return 1;
		});
		ports.artifacts.deleteExpiredCounselingRecords.mockRejectedValue(new Error('Counseling cleanup unavailable'));
		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'Counseling cleanup unavailable'
		);
		expect(followUpsDeleted).toBe(true);
		expect(ports.artifacts.deleteExpiredDocuments).not.toHaveBeenCalled();
		expect(ports.artifacts.deleteExpiredLeaderNotes).not.toHaveBeenCalled();
		expect(ports.personnel.deleteExpired).not.toHaveBeenCalled();
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('forwards each Organization cutoff to every named artifact owner', async () => {
		const ports = buildPorts();
		await cleanupArchivedRecords(
			ports,
			[
				{ id: 'org-1', retentionMonths: 12 },
				{ id: 'org-2', retentionMonths: 6 }
			],
			{ now: NOW }
		);
		for (const cleanup of Object.values(ports.artifacts))
			expect(cleanup.mock.calls).toEqual([
				['org-1', '2025-05-30T12:00:00.000Z'],
				['org-2', '2025-11-30T12:00:00.000Z']
			]);
	});

	it('dispatches parent retention after notes and uses its actual count in the summary', async () => {
		const ports = buildPorts();
		let notesDeleted = false;
		ports.artifacts.deleteExpiredLeaderNotes.mockImplementation(async () => {
			notesDeleted = true;
			return 1;
		});
		ports.personnel.deleteExpired.mockImplementation(async () => {
			expect(notesDeleted).toBe(true);
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

	it('retains rows exactly at the cutoff and makes a zero-effect replay without another notification', async () => {
		const ports = buildPorts();
		for (const table of ['ict_tasks', 'assignment_types']) {
			ports.store.seed(table, [
				{ id: `${table}-before`, organization_id: 'org-1', archived_at: '2025-05-30T11:59:59.999Z' },
				{ id: `${table}-equal`, organization_id: 'org-1', archived_at: '2025-05-30T12:00:00.000Z' },
				{ id: `${table}-after`, organization_id: 'org-1', archived_at: '2025-05-30T12:00:00.001Z' },
				{ id: `${table}-active`, organization_id: 'org-1', archived_at: null }
			]);
		}
		const configs = [{ id: 'org-1', retentionMonths: 12 }];

		const result = await cleanupArchivedRecords(ports, configs, { now: NOW });

		expect(result).toMatchObject({ deletedCount: 2, orgsAffected: 1 });
		for (const table of ['ict_tasks', 'assignment_types']) {
			await expect(idsFor(ports, table)).resolves.toEqual([`${table}-active`, `${table}-after`, `${table}-equal`]);
		}
		expect(ports.notifications.notifyAdmins).toHaveBeenCalledTimes(1);

		const repeated = await cleanupArchivedRecords(ports, configs, { now: NOW });

		expect(repeated).toMatchObject({ deletedCount: 0, orgsAffected: 0 });
		expect(repeated.families.every((family) => family.deletedCount === 0)).toBe(true);
		for (const table of ['ict_tasks', 'assignment_types']) {
			await expect(idsFor(ports, table)).resolves.toEqual([`${table}-active`, `${table}-after`, `${table}-equal`]);
		}
		expect(ports.notifications.notifyAdmins).toHaveBeenCalledTimes(1);
	});

	it('retains Critical Tasks when completion references cannot be read and stops later family effects', async () => {
		const ports = buildPorts();
		ports.store.seed('ict_tasks', [
			{ id: 'possibly-referenced', organization_id: 'org-1', archived_at: isoMonthsAgo(13) }
		]);
		ports.store.seed('assignment_types', [
			{ id: 'later-expired-type', organization_id: 'org-1', archived_at: isoMonthsAgo(13) }
		]);
		const findMany = ports.store.findMany.bind(ports.store);
		vi.spyOn(ports.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table === 'personnel_ict_completions') throw new Error('Critical Tasks reference check unavailable');
			return findMany(table, orgId, filters, options);
		});

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'Critical Tasks reference check unavailable'
		);

		await expect(idsFor(ports, 'ict_tasks')).resolves.toEqual(['possibly-referenced']);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['later-expired-type']);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
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

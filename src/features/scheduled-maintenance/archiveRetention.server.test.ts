import { describe, expect, it, vi } from 'vitest';
import { cleanupArchivedRecords } from './archiveRetention.server';

const now = new Date('2026-05-30T12:00:00.000Z');

function buildPorts() {
	return {
		artifacts: {
			deleteExpiredFollowUps: vi.fn(async (_orgId: string, _cutoff: string) => 0),
			deleteExpiredCounselingRecords: vi.fn(async (_orgId: string, _cutoff: string) => 0),
			deleteExpiredDocuments: vi.fn(async (_orgId: string, _cutoff: string) => 0),
			deleteExpiredLeaderNotes: vi.fn(async (_orgId: string, _cutoff: string) => 0)
		},
		personnel: { deleteExpired: vi.fn(async (_orgId: string, _cutoff: string) => 0) },
		criticalTasks: { deleteExpired: vi.fn(async (_orgId: string, _cutoff: string) => 0) },
		assignmentTypes: { deleteExpired: vi.fn(async (_orgId: string, _cutoff: string) => 0) },
		files: { drainRetiredFiles: vi.fn(async () => ({ removed: 0, failed: 0 })) },
		notifications: {
			notifyAdmins: vi.fn(
				async (
					_orgId: string,
					_link: string | null,
					_payload: {
						type: string;
						title: string;
						message: string;
					}
				) => undefined
			)
		}
	};
}

function sources(ports: ReturnType<typeof buildPorts>) {
	return [
		...Object.values(ports.artifacts),
		ports.personnel.deleteExpired,
		ports.criticalTasks.deleteExpired,
		ports.assignmentTypes.deleteExpired
	];
}

describe('Scheduled Maintenance archive dispatch', () => {
	it('reports all seven actual owner counts in the retained response and administrator summary', async () => {
		const ports = buildPorts();
		sources(ports).forEach((source, index) => source.mockResolvedValue(index + 2));
		const result = await cleanupArchivedRecords(ports, [{ id: 'org-a', retentionMonths: 12 }], { now });
		expect(result).toEqual({
			deletedCount: 35,
			orgsAffected: 1,
			families: [
				{ key: 'personnel-follow-ups', table: 'personnel_follow_ups', label: 'Personnel follow-ups', deletedCount: 2 },
				{ key: 'counseling-records', table: 'counseling_records', label: 'Counseling records', deletedCount: 3 },
				{ key: 'personnel-documents', table: 'personnel_documents', label: 'Personnel documents', deletedCount: 4 },
				{ key: 'leader-notes', table: 'leader_notes', label: 'Leader notes', deletedCount: 5 },
				{ key: 'personnel', table: 'personnel', label: 'Personnel', deletedCount: 6 },
				{ key: 'critical-tasks', table: 'ict_tasks', label: 'Critical Tasks library', deletedCount: 7 },
				{ key: 'assignment-types', table: 'assignment_types', label: 'Assignment Types', deletedCount: 8 }
			],
			files: { removed: 0, failed: 0 }
		});
		const [organization, link, payload] = ports.notifications.notifyAdmins.mock.calls[0];
		expect([organization, link, payload.type]).toEqual(['org-a', null, 'archive_auto_deleted']);
		expect(payload.message).toContain('35 archived records');
		expect(payload.message).toContain('Critical Tasks library: 7');
		expect(payload.message).toContain('Assignment Types: 8');
	});

	it('passes each Organization cutoff to every owner', async () => {
		const ports = buildPorts();
		await cleanupArchivedRecords(
			ports,
			[
				{ id: 'org-a', retentionMonths: 12 },
				{ id: 'org-b', retentionMonths: 6 }
			],
			{ now }
		);
		for (const source of sources(ports))
			expect(source.mock.calls).toEqual([
				['org-a', '2025-05-30T12:00:00.000Z'],
				['org-b', '2025-11-30T12:00:00.000Z']
			]);
	});

	it.each([undefined, null, 0, -1, NaN, Infinity])('uses the 36-month default for %s', async (retentionMonths) => {
		const ports = buildPorts();
		await cleanupArchivedRecords(ports, [{ id: 'org-a', retentionMonths }], { now });
		for (const source of sources(ports)) expect(source.mock.calls).toEqual([['org-a', '2023-05-30T12:00:00.000Z']]);
	});

	it('clamps the one-month cutoff to the UTC month end', async () => {
		const ports = buildPorts();
		await cleanupArchivedRecords(ports, [{ id: 'org-a', retentionMonths: 0.5 }], {
			now: new Date('2026-03-31T12:00:00.000Z')
		});
		for (const source of sources(ports)) expect(source.mock.calls).toEqual([['org-a', '2026-02-28T12:00:00.000Z']]);
	});

	it.each([0, 1, 2, 3, 4, 5, 6])(
		'retains earlier effects and stops later families when owner %s fails',
		async (failureIndex) => {
			const ports = buildPorts();
			const committed: number[] = [];
			sources(ports).forEach((source, index) =>
				source.mockImplementation(async () => {
					if (index === failureIndex) throw new Error('owner unavailable');
					committed.push(index);
					return 1;
				})
			);
			await expect(cleanupArchivedRecords(ports, [{ id: 'org-a', retentionMonths: 12 }], { now })).rejects.toThrow(
				'owner unavailable'
			);
			expect(committed).toEqual([0, 1, 2, 3, 4, 5].slice(0, failureIndex));
			expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
		}
	);

	it('reports zero new effects and emits no duplicate summary on replay', async () => {
		const ports = buildPorts();
		ports.criticalTasks.deleteExpired.mockResolvedValueOnce(1001);
		ports.assignmentTypes.deleteExpired.mockResolvedValueOnce(1001);
		const configs = [{ id: 'org-a', retentionMonths: 12 }];
		await expect(cleanupArchivedRecords(ports, configs, { now })).resolves.toMatchObject({
			deletedCount: 2002,
			orgsAffected: 1
		});
		const replay = await cleanupArchivedRecords(ports, configs, { now });
		expect(replay).toMatchObject({ deletedCount: 0, orgsAffected: 0 });
		expect(replay.families.map((family) => family.deletedCount)).toEqual([0, 0, 0, 0, 0, 0, 0]);
		expect(ports.notifications.notifyAdmins).toHaveBeenCalledTimes(1);
	});

	it('stops the next Organization after required summary delivery fails', async () => {
		const ports = buildPorts();
		const committed: string[] = [];
		ports.personnel.deleteExpired.mockImplementation(async (organization) => {
			committed.push(organization);
			return 1;
		});
		ports.notifications.notifyAdmins.mockRejectedValue(new Error('summary unavailable'));
		await expect(cleanupArchivedRecords(ports, [{ id: 'org-a' }, { id: 'org-b' }], { now })).rejects.toThrow(
			'summary unavailable'
		);
		expect(committed).toEqual(['org-a']);
	});

	it('drains queued file cleanup after an unrelated family fails, then reports that failure', async () => {
		const ports = buildPorts();
		ports.criticalTasks.deleteExpired.mockRejectedValue(new Error('library retention unavailable'));
		ports.files.drainRetiredFiles.mockResolvedValue({ removed: 3, failed: 1 });
		await expect(cleanupArchivedRecords(ports, [{ id: 'org-a' }], { now })).rejects.toThrow(
			'library retention unavailable'
		);
		expect(ports.files.drainRetiredFiles).toHaveBeenCalledTimes(1);
	});

	it('reports file cleanup outcomes after this run queues its deleted files', async () => {
		const ports = buildPorts();
		const order: string[] = [];
		ports.personnel.deleteExpired.mockImplementation(async () => (order.push('personnel'), 2));
		ports.files.drainRetiredFiles.mockImplementation(async () => (order.push('files'), { removed: 4, failed: 1 }));
		await expect(cleanupArchivedRecords(ports, [{ id: 'org-a' }], { now })).resolves.toMatchObject({
			deletedCount: 2,
			files: { removed: 4, failed: 1 }
		});
		expect(order).toEqual(['personnel', 'files']);
	});

	it('does not run owners or emit summaries without Organizations but still drains queued files', async () => {
		const ports = buildPorts();
		ports.files.drainRetiredFiles.mockResolvedValue({ removed: 2, failed: 0 });
		await expect(cleanupArchivedRecords(ports, [], { now })).resolves.toMatchObject({
			deletedCount: 0,
			orgsAffected: 0,
			files: { removed: 2, failed: 0 }
		});
		for (const source of sources(ports)) expect(source).not.toHaveBeenCalled();
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});
});

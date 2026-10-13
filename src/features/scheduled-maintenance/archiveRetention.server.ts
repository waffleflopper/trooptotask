import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import type { PersonnelArtifactRetentionSource, PersonnelRetentionSource } from '$features/personnel/index.server';
import type { AssignmentTypeRetentionSource } from '$features/calendar/index.server';
import type { CriticalTaskRetentionSource } from '$features/critical-tasks/index.server';
import type { OrganizationRetentionConfiguration } from '$features/organization/contracts';
import type { RetiredFileDrainResult } from '$features/organization/index.server';
import { retentionCutoff } from '$lib/utils/retentionCutoff';
import { DEFAULT_ARCHIVE_RETENTION_MONTHS } from '$features/organization/contracts';

const MIN_ARCHIVE_RETENTION_MONTHS = 1;

export interface ArchiveRetentionFamilyResult {
	key: string;
	table: string;
	label: string;
	deletedCount: number;
}

export interface ArchiveRetentionCleanupResult {
	deletedCount: number;
	orgsAffected: number;
	families: ArchiveRetentionFamilyResult[];
	files: RetiredFileDrainResult;
}

interface ArchiveRetentionPorts {
	criticalTasks: CriticalTaskRetentionSource;
	artifacts: PersonnelArtifactRetentionSource;
	personnel: PersonnelRetentionSource;
	assignmentTypes: AssignmentTypeRetentionSource;
	files: { drainRetiredFiles(): Promise<RetiredFileDrainResult> };
	notifications: Pick<NotificationDeliveryPort, 'notifyAdmins'>;
}

interface CleanupFamily {
	key: string;
	table: string;
	label: string;
	cleanup(ports: ArchiveRetentionPorts, orgId: string, cutoff: string): Promise<number>;
}

const ARCHIVE_RETENTION_FAMILIES: CleanupFamily[] = [
	{
		key: 'personnel-follow-ups',
		table: 'personnel_follow_ups',
		label: 'Personnel follow-ups',
		cleanup: (ports, orgId, cutoff) => ports.artifacts.deleteExpiredFollowUps(orgId, cutoff)
	},
	{
		key: 'counseling-records',
		table: 'counseling_records',
		label: 'Counseling records',
		cleanup: (ports, orgId, cutoff) => ports.artifacts.deleteExpiredCounselingRecords(orgId, cutoff)
	},
	{
		key: 'personnel-documents',
		table: 'personnel_documents',
		label: 'Personnel documents',
		cleanup: (ports, orgId, cutoff) => ports.artifacts.deleteExpiredDocuments(orgId, cutoff)
	},
	{
		key: 'leader-notes',
		table: 'leader_notes',
		label: 'Leader notes',
		cleanup: (ports, orgId, cutoff) => ports.artifacts.deleteExpiredLeaderNotes(orgId, cutoff)
	},
	{
		key: 'personnel',
		table: 'personnel',
		label: 'Personnel',
		cleanup: (ports, orgId, cutoff) => ports.personnel.deleteExpired(orgId, cutoff)
	},
	{
		key: 'critical-tasks',
		table: 'ict_tasks',
		label: 'Critical Tasks library',
		cleanup: (ports, orgId, cutoff) => ports.criticalTasks.deleteExpired(orgId, cutoff)
	},
	{
		key: 'assignment-types',
		table: 'assignment_types',
		label: 'Assignment Types',
		cleanup: (ports, orgId, cutoff) => ports.assignmentTypes.deleteExpired(orgId, cutoff)
	}
];

function normalizeRetentionMonths(retentionMonths: number | null | undefined): number {
	if (retentionMonths == null || !Number.isFinite(retentionMonths) || retentionMonths <= 0) {
		return DEFAULT_ARCHIVE_RETENTION_MONTHS;
	}
	return Math.max(MIN_ARCHIVE_RETENTION_MONTHS, retentionMonths);
}

function notificationMessage(families: ArchiveRetentionFamilyResult[]): string {
	const deletedFamilies = families.filter((family) => family.deletedCount > 0);
	const total = deletedFamilies.reduce((sum, family) => sum + family.deletedCount, 0);
	const summary = deletedFamilies.map((family) => `${family.label}: ${family.deletedCount}`).join('; ');
	return `${total} archived record${total === 1 ? '' : 's'} auto-deleted after retention period. ${summary}`;
}

export async function cleanupArchivedRecords(
	ports: ArchiveRetentionPorts,
	orgConfigs: OrganizationRetentionConfiguration[],
	options: { now?: Date } = {}
): Promise<ArchiveRetentionCleanupResult> {
	const familyTotals = new Map<string, ArchiveRetentionFamilyResult>(
		ARCHIVE_RETENTION_FAMILIES.map((family) => [
			family.key,
			{ key: family.key, table: family.table, label: family.label, deletedCount: 0 }
		])
	);
	const affectedOrgs = new Set<string>();
	const now = options.now ?? new Date();

	try {
		for (const org of orgConfigs) {
			const cutoff = retentionCutoff(now, normalizeRetentionMonths(org.retentionMonths));
			const orgFamilyResults: ArchiveRetentionFamilyResult[] = [];

			for (const family of ARCHIVE_RETENTION_FAMILIES) {
				const deletedCount = await family.cleanup(ports, org.id, cutoff);
				if (deletedCount === 0) continue;

				const familyTotal = familyTotals.get(family.key);
				if (familyTotal) familyTotal.deletedCount += deletedCount;
				orgFamilyResults.push({
					key: family.key,
					table: family.table,
					label: family.label,
					deletedCount
				});
			}

			if (orgFamilyResults.length > 0) {
				affectedOrgs.add(org.id);
				await ports.notifications.notifyAdmins(org.id, null, {
					type: 'archive_auto_deleted',
					title: 'Archived Records Auto-Deleted',
					message: notificationMessage(orgFamilyResults)
				});
			}
		}
	} catch (error) {
		// Files queued by any run, including this failed one, still get removed.
		await ports.files.drainRetiredFiles().catch(() => undefined);
		throw error;
	}
	const files = await ports.files.drainRetiredFiles();

	const families = [...familyTotals.values()];
	const deletedCount = families.reduce((sum, family) => sum + family.deletedCount, 0);

	return {
		deletedCount,
		orgsAffected: affectedOrgs.size,
		families,
		files
	};
}

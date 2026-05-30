import type { DataStore, StoragePort } from '$lib/server/core/ports';
import { PERSONNEL_DOCUMENTS_BUCKET } from './personnelDocuments';

export const DEFAULT_ARCHIVE_RETENTION_MONTHS = 36;

export interface ArchiveRetentionOrgConfig {
	id: string;
	retentionMonths?: number | null;
}

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
}

interface NotificationPayload {
	type: string;
	title: string;
	message: string;
	link?: string | null;
}

interface ArchiveRetentionPorts {
	store: DataStore;
	storage: StoragePort;
}

interface CleanupFamily {
	key: string;
	table: string;
	label: string;
	timestampColumn: string;
	filters?: Record<string, unknown>;
	beforeDelete?: (ports: ArchiveRetentionPorts, orgId: string, rows: CleanupCandidate[]) => Promise<void>;
}

interface CleanupCandidate {
	id: string;
	file_path?: string | null;
}

const ARCHIVE_RETENTION_FAMILIES: CleanupFamily[] = [
	{
		key: 'personnel-follow-ups',
		table: 'personnel_follow_ups',
		label: 'Personnel follow-ups',
		timestampColumn: 'archived_at',
		filters: { status: 'archived' }
	},
	{
		key: 'counseling-records',
		table: 'counseling_records',
		label: 'Counseling records',
		timestampColumn: 'archived_at'
	},
	{
		key: 'personnel-documents',
		table: 'personnel_documents',
		label: 'Personnel documents',
		timestampColumn: 'archived_at',
		beforeDelete: removePersonnelDocumentFiles
	},
	{
		key: 'leader-notes',
		table: 'leader_notes',
		label: 'Leader notes',
		timestampColumn: 'archived_at'
	},
	{
		key: 'personnel',
		table: 'personnel',
		label: 'Personnel',
		timestampColumn: 'archived_at'
	},
	{
		key: 'critical-tasks',
		table: 'ict_tasks',
		label: 'Critical Tasks library',
		timestampColumn: 'archived_at'
	},
	{
		key: 'assignment-types',
		table: 'assignment_types',
		label: 'Assignment Types',
		timestampColumn: 'archived_at'
	},
	{
		key: 'duty-roster-templates',
		table: 'duty_roster_templates',
		label: 'Duty Roster Templates',
		timestampColumn: 'archived_at',
		filters: { status: 'archived' }
	}
	// `duty_templates` is a legacy table and is intentionally excluded from archive retention cleanup.
];

async function notifyAdminsViaStore(
	store: DataStore,
	orgId: string,
	excludeUserId: string | null,
	notification: NotificationPayload
): Promise<void> {
	const admins = await store.findMany<{ user_id: string; role: string }>(
		'organization_memberships',
		orgId,
		{},
		{
			inFilters: { role: ['owner', 'admin'] }
		}
	);

	const rows = admins
		.filter((adm) => !excludeUserId || adm.user_id !== excludeUserId)
		.map((adm) => ({
			user_id: adm.user_id,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			link: notification.link ?? null
		}));

	if (rows.length > 0) {
		await store.insertMany('notifications', orgId, rows);
	}
}

function retentionCutoff(now: Date, retentionMonths: number): string {
	const cutoff = new Date(now);
	cutoff.setMonth(cutoff.getMonth() - retentionMonths);
	return cutoff.toISOString();
}

function normalizeRetentionMonths(retentionMonths: number | null | undefined): number {
	return retentionMonths ?? DEFAULT_ARCHIVE_RETENTION_MONTHS;
}

async function removePersonnelDocumentFiles(
	ports: ArchiveRetentionPorts,
	_orgId: string,
	rows: CleanupCandidate[]
): Promise<void> {
	const paths = rows
		.map((row) => row.file_path)
		.filter((path): path is string => typeof path === 'string' && path.length > 0);

	if (paths.length > 0) {
		await ports.storage.remove(PERSONNEL_DOCUMENTS_BUCKET, paths);
	}
}

function notificationMessage(families: ArchiveRetentionFamilyResult[]): string {
	const deletedFamilies = families.filter((family) => family.deletedCount > 0);
	const total = deletedFamilies.reduce((sum, family) => sum + family.deletedCount, 0);
	const summary = deletedFamilies.map((family) => `${family.label}: ${family.deletedCount}`).join('; ');
	return `${total} archived record${total === 1 ? '' : 's'} auto-deleted after retention period. ${summary}`;
}

export async function cleanupArchivedRecords(
	ports: ArchiveRetentionPorts,
	orgConfigs: ArchiveRetentionOrgConfig[],
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

	for (const org of orgConfigs) {
		const cutoff = retentionCutoff(now, normalizeRetentionMonths(org.retentionMonths));
		const orgFamilyResults: ArchiveRetentionFamilyResult[] = [];

		for (const family of ARCHIVE_RETENTION_FAMILIES) {
			const rows = await ports.store.findMany<CleanupCandidate>(family.table, org.id, family.filters, {
				select: family.table === 'personnel_documents' ? 'id, file_path' : 'id',
				rangeFilters: [{ column: family.timestampColumn, op: 'lt', value: cutoff }],
				isNull: { [family.timestampColumn]: false }
			});

			if (rows.length === 0) continue;

			await family.beforeDelete?.(ports, org.id, rows);
			const deletedCount = await ports.store.deleteManyByIds(
				family.table,
				org.id,
				rows.map((row) => row.id)
			);

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
			await notifyAdminsViaStore(ports.store, org.id, null, {
				type: 'archive_auto_deleted',
				title: 'Archived Records Auto-Deleted',
				message: notificationMessage(orgFamilyResults)
			});
		}
	}

	const families = [...familyTotals.values()];
	const deletedCount = families.reduce((sum, family) => sum + family.deletedCount, 0);

	return {
		deletedCount,
		orgsAffected: affectedOrgs.size,
		families
	};
}

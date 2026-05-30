import type { DataStore, StoragePort } from '$lib/server/core/ports';
import { COUNSELING_RECORDS_BUCKET } from './personnelCounselingRecords';
import { PERSONNEL_DOCUMENTS_BUCKET } from './personnelDocuments';

export const DEFAULT_ARCHIVE_RETENTION_MONTHS = 36;
const MIN_ARCHIVE_RETENTION_MONTHS = 1;

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
	select?: string;
	filterCandidates?: (
		ports: ArchiveRetentionPorts,
		orgId: string,
		rows: CleanupCandidate[]
	) => Promise<CleanupCandidate[]>;
	beforeDelete?: (ports: ArchiveRetentionPorts, orgId: string, rows: CleanupCandidate[]) => Promise<void>;
}

interface CleanupCandidate {
	id: string;
	file_path?: string | null;
	personnel_id?: string | null;
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
		timestampColumn: 'archived_at',
		select: 'id, file_path',
		beforeDelete: removeCounselingRecordFiles
	},
	{
		key: 'personnel-documents',
		table: 'personnel_documents',
		label: 'Personnel documents',
		timestampColumn: 'archived_at',
		select: 'id, file_path',
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
		timestampColumn: 'archived_at',
		beforeDelete: removePersonnelOwnedDocumentFiles
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
		timestampColumn: 'archived_at',
		filterCandidates: excludeReferencedAssignmentTypes
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
	if (retentionMonths == null || !Number.isFinite(retentionMonths) || retentionMonths <= 0) {
		return DEFAULT_ARCHIVE_RETENTION_MONTHS;
	}
	return Math.max(MIN_ARCHIVE_RETENTION_MONTHS, retentionMonths);
}

async function excludeReferencedAssignmentTypes(
	ports: ArchiveRetentionPorts,
	orgId: string,
	rows: CleanupCandidate[]
): Promise<CleanupCandidate[]> {
	const candidateIds = rows.map((row) => row.id);
	if (candidateIds.length === 0) return rows;

	const [dailyAssignments, rosterTemplates, rosterHistory] = await Promise.all([
		ports.store.findMany<{ assignment_type_id: string }>('daily_assignments', orgId, undefined, {
			select: 'assignment_type_id',
			inFilters: { assignment_type_id: candidateIds }
		}),
		ports.store.findMany<{ assignment_type_id: string }>('duty_roster_templates', orgId, undefined, {
			select: 'assignment_type_id',
			inFilters: { assignment_type_id: candidateIds }
		}),
		ports.store.findMany<{ assignment_type_id: string }>('duty_roster_history', orgId, undefined, {
			select: 'assignment_type_id',
			inFilters: { assignment_type_id: candidateIds }
		})
	]);

	const referencedIds = new Set(
		[...dailyAssignments, ...rosterTemplates, ...rosterHistory].map((row) => row.assignment_type_id)
	);
	return rows.filter((row) => !referencedIds.has(row.id));
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

async function removeCounselingRecordFiles(
	ports: ArchiveRetentionPorts,
	_orgId: string,
	rows: CleanupCandidate[]
): Promise<void> {
	const paths = rows
		.map((row) => row.file_path)
		.filter((path): path is string => typeof path === 'string' && path.length > 0);

	if (paths.length > 0) {
		await ports.storage.remove(COUNSELING_RECORDS_BUCKET, paths);
	}
}

async function removePersonnelOwnedDocumentFiles(
	ports: ArchiveRetentionPorts,
	orgId: string,
	rows: CleanupCandidate[]
): Promise<void> {
	const personnelIds = rows.map((row) => row.id);
	if (personnelIds.length === 0) return;

	const [documents, counselingRecords] = await Promise.all([
		ports.store.findMany<CleanupCandidate>('personnel_documents', orgId, undefined, {
			select: 'id, file_path',
			inFilters: { personnel_id: personnelIds }
		}),
		ports.store.findMany<CleanupCandidate>('counseling_records', orgId, undefined, {
			select: 'id, file_path',
			inFilters: { personnel_id: personnelIds }
		})
	]);

	await Promise.all([
		removePersonnelDocumentFiles(ports, orgId, documents),
		removeCounselingRecordFiles(ports, orgId, counselingRecords)
	]);
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
			let rows = await ports.store.findMany<CleanupCandidate>(family.table, org.id, family.filters, {
				select: family.select ?? 'id',
				rangeFilters: [{ column: family.timestampColumn, op: 'lt', value: cutoff }],
				isNull: { [family.timestampColumn]: false }
			});

			rows = (await family.filterCandidates?.(ports, org.id, rows)) ?? rows;
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

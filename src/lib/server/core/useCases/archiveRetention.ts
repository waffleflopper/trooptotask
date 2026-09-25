import type { DataStore, StoragePort } from '$lib/server/core/ports';
import type { LeaderNoteDataSource } from '$features/personnel/index.server';
import { COUNSELING_RECORDS_BUCKET } from './personnelCounselingRecords';
import { PERSONNEL_DOCUMENTS_BUCKET } from './personnelDocuments';
import { notifyAdminsViaStore, retentionCutoff } from './retentionSupport';

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

interface ArchiveRetentionPorts {
	store: DataStore;
	storage: StoragePort;
	leaderNotes: Pick<LeaderNoteDataSource, 'deleteExpired'>;
	assignmentTypes: {
		deleteExpiredUnreferenced(orgId: string, ids: string[], cutoff: string): Promise<number>;
	};
}

interface CleanupFamilyIdentity {
	key: string;
	table: string;
	label: string;
}

interface StoredCleanupFamily extends CleanupFamilyIdentity {
	timestampColumn: string;
	filters?: Record<string, unknown>;
	select?: string;
	filterCandidates?: (
		ports: ArchiveRetentionPorts,
		orgId: string,
		rows: CleanupCandidate[]
	) => Promise<CleanupCandidate[]>;
	deleteCandidates?: (
		ports: ArchiveRetentionPorts,
		orgId: string,
		rows: CleanupCandidate[],
		cutoff: string
	) => Promise<number>;
	prepareDelete?: (
		ports: ArchiveRetentionPorts,
		orgId: string,
		rows: CleanupCandidate[]
	) => Promise<((deletedRows: CleanupCandidate[]) => Promise<void>) | undefined>;
}

type CleanupFamily =
	| StoredCleanupFamily
	| (CleanupFamilyIdentity & {
			cleanup(ports: ArchiveRetentionPorts, orgId: string, cutoff: string): Promise<number>;
	  });

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
		prepareDelete: prepareCounselingRecordFileRemoval
	},
	{
		key: 'personnel-documents',
		table: 'personnel_documents',
		label: 'Personnel documents',
		timestampColumn: 'archived_at',
		select: 'id, file_path',
		prepareDelete: preparePersonnelDocumentFileRemoval
	},
	{
		key: 'leader-notes',
		table: 'leader_notes',
		label: 'Leader notes',
		cleanup: (ports, orgId, cutoff) => ports.leaderNotes.deleteExpired(orgId, cutoff)
	},
	{
		key: 'personnel',
		table: 'personnel',
		label: 'Personnel',
		timestampColumn: 'archived_at',
		prepareDelete: preparePersonnelOwnedDocumentFileRemoval
	},
	{
		key: 'critical-tasks',
		table: 'ict_tasks',
		label: 'Critical Tasks library',
		timestampColumn: 'archived_at',
		filterCandidates: excludeReferencedCriticalTasks
	},
	{
		key: 'assignment-types',
		table: 'assignment_types',
		label: 'Assignment Types',
		timestampColumn: 'archived_at',
		deleteCandidates: (ports, orgId, rows, cutoff) =>
			ports.assignmentTypes.deleteExpiredUnreferenced(
				orgId,
				rows.map((row) => row.id),
				cutoff
			)
	}
];

function normalizeRetentionMonths(retentionMonths: number | null | undefined): number {
	if (retentionMonths == null || !Number.isFinite(retentionMonths) || retentionMonths <= 0) {
		return DEFAULT_ARCHIVE_RETENTION_MONTHS;
	}
	return Math.max(MIN_ARCHIVE_RETENTION_MONTHS, retentionMonths);
}

async function excludeReferencedCriticalTasks(
	ports: ArchiveRetentionPorts,
	orgId: string,
	rows: CleanupCandidate[]
): Promise<CleanupCandidate[]> {
	const candidateIds = rows.map((row) => row.id);
	if (candidateIds.length === 0) return rows;

	const completions = await ports.store.findMany<{ ict_task_id: string }>(
		'personnel_ict_completions',
		orgId,
		undefined,
		{
			select: 'ict_task_id',
			inFilters: { ict_task_id: candidateIds }
		}
	);

	const referencedIds = new Set(completions.map((row) => row.ict_task_id));
	return rows.filter((row) => !referencedIds.has(row.id));
}

function prepareFileRemoval(
	ports: ArchiveRetentionPorts,
	bucket: string,
	rows: CleanupCandidate[]
): ((deletedRows: CleanupCandidate[]) => Promise<void>) | undefined {
	const pathsById = new Map(
		rows
			.filter((row) => typeof row.file_path === 'string' && row.file_path.length > 0)
			.map((row) => [row.id, row.file_path as string])
	);

	if (pathsById.size === 0) return undefined;

	return async (deletedRows) => {
		const paths = deletedRows
			.map((row) => pathsById.get(row.id))
			.filter((path): path is string => typeof path === 'string' && path.length > 0);

		if (paths.length > 0) {
			await ports.storage.remove(bucket, paths);
		}
	};
}

async function preparePersonnelDocumentFileRemoval(
	ports: ArchiveRetentionPorts,
	_orgId: string,
	rows: CleanupCandidate[]
): Promise<((deletedRows: CleanupCandidate[]) => Promise<void>) | undefined> {
	return prepareFileRemoval(ports, PERSONNEL_DOCUMENTS_BUCKET, rows);
}

async function prepareCounselingRecordFileRemoval(
	ports: ArchiveRetentionPorts,
	_orgId: string,
	rows: CleanupCandidate[]
): Promise<((deletedRows: CleanupCandidate[]) => Promise<void>) | undefined> {
	return prepareFileRemoval(ports, COUNSELING_RECORDS_BUCKET, rows);
}

async function preparePersonnelOwnedDocumentFileRemoval(
	ports: ArchiveRetentionPorts,
	orgId: string,
	rows: CleanupCandidate[]
): Promise<((deletedRows: CleanupCandidate[]) => Promise<void>) | undefined> {
	const personnelIds = rows.map((row) => row.id);
	if (personnelIds.length === 0) return undefined;

	const [documents, counselingRecords] = await Promise.all([
		ports.store.findMany<CleanupCandidate>('personnel_documents', orgId, undefined, {
			select: 'id, personnel_id, file_path',
			inFilters: { personnel_id: personnelIds }
		}),
		ports.store.findMany<CleanupCandidate>('counseling_records', orgId, undefined, {
			select: 'id, personnel_id, file_path',
			inFilters: { personnel_id: personnelIds }
		})
	]);

	const documentCleanup = prepareFileRemoval(ports, PERSONNEL_DOCUMENTS_BUCKET, documents);
	const counselingCleanup = prepareFileRemoval(ports, COUNSELING_RECORDS_BUCKET, counselingRecords);

	if (!documentCleanup && !counselingCleanup) return undefined;

	return async (deletedRows) => {
		const deletedPersonnelIds = new Set(deletedRows.map((row) => row.id));
		await Promise.all([
			documentCleanup?.(documents.filter((row) => row.personnel_id && deletedPersonnelIds.has(row.personnel_id))),
			counselingCleanup?.(
				counselingRecords.filter((row) => row.personnel_id && deletedPersonnelIds.has(row.personnel_id))
			)
		]);
	};
}

async function cleanupStoredFamily(
	ports: ArchiveRetentionPorts,
	family: StoredCleanupFamily,
	orgId: string,
	cutoff: string
): Promise<number> {
	let rows = await ports.store.findMany<CleanupCandidate>(family.table, orgId, family.filters, {
		select: family.select ?? 'id',
		rangeFilters: [{ column: family.timestampColumn, op: 'lt', value: cutoff }],
		isNull: { [family.timestampColumn]: false }
	});

	rows = (await family.filterCandidates?.(ports, orgId, rows)) ?? rows;
	if (rows.length === 0) return 0;

	const afterDelete = await family.prepareDelete?.(ports, orgId, rows);
	const deletedCount = family.deleteCandidates
		? await family.deleteCandidates(ports, orgId, rows, cutoff)
		: await ports.store.deleteManyByIds(
				family.table,
				orgId,
				rows.map((row) => row.id)
			);
	if (afterDelete && deletedCount > 0) {
		const remainingRows = await ports.store.findMany<CleanupCandidate>(family.table, orgId, undefined, {
			select: 'id',
			inFilters: { id: rows.map((row) => row.id) }
		});
		const remainingIds = new Set(remainingRows.map((row) => row.id));
		await afterDelete(rows.filter((row) => !remainingIds.has(row.id)));
	}
	return deletedCount;
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
			const deletedCount =
				'cleanup' in family
					? await family.cleanup(ports, org.id, cutoff)
					: await cleanupStoredFamily(ports, family, org.id, cutoff);
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

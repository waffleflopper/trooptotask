import type { PersonnelLeaderNote } from '$features/personnel/contracts';
import { mapLeaderNoteRow, type LeaderNoteRow } from '$features/personnel/index.server';
import type {
	PersonnelArtifactKind,
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelFollowUp
} from '$features/personnel/personnel-detail.types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { FindOptions, UseCaseContext } from '$lib/server/core/ports';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const artifactAccessCache = new WeakMap<UseCaseContext, Map<string, Promise<void>>>();

interface MembershipContributorRow {
	user_id: string;
	email?: string | null;
	name?: string | null;
	display_name?: string | null;
	full_name?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	username?: string | null;
}

export interface CounselingRecordRow {
	id: string;
	personnel_id: string;
	date_conducted: string;
	title?: string | null;
	subject?: string | null;
	summary?: string | null;
	notes?: string | null;
	uploaded_by?: string | null;
	file_path: string | null;
	created_at?: string | null;
	archived_at?: string | null;
}

export interface PersonnelDocumentRow {
	id: string;
	personnel_id: string;
	title: string;
	file_path: string;
	file_size_bytes: number;
	content_type: string;
	uploaded_by: string;
	created_at?: string | null;
	archived_at?: string | null;
}

export interface FollowUpRow {
	id: string;
	personnel_id: string;
	title: string;
	notes: string | null;
	due_date: string | null;
	status: 'open' | 'completed' | 'archived';
	created_by: string;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	archived_at?: string | null;
}

export interface PersonnelArtifactSpec<TRow, TDto> {
	table: string;
	noun: string;
	nounPlural: string;
	auditPrefix: string;
	contributorColumn: keyof TRow;
	map(row: TRow, labels: Map<string, string>): TDto;
	isArchived(row: TRow): boolean;
	listClause(opts: { archived?: boolean; limit?: number }, personnelId: string): FindOptions;
	archivePatch?(now: string): Partial<TRow>;
	restorePatch?(): Partial<TRow>;
	ownedArchive?: {
		filters?: Record<string, unknown>;
		archivePatch(archivedAt: string): Partial<TRow>;
		restoreFilters(personnelArchivedAt: string): Record<string, unknown>;
		restorePatch(): Partial<TRow>;
	};
}

interface PersonnelOwnedArchiveSpec {
	table: string;
	filters?: Record<string, unknown>;
	archivePatch(archivedAt: string): Record<string, unknown>;
	restoreFilters(personnelArchivedAt: string): Record<string, unknown>;
	restorePatch(): Record<string, unknown>;
}

export async function requirePersonnelArtifactAccess(ctx: UseCaseContext, personnelId: string): Promise<void> {
	return requirePersonnelArtifactPolicy(ctx, personnelId, 'write');
}

export async function requirePersonnelArtifactReadAccess(ctx: UseCaseContext, personnelId: string): Promise<void> {
	return requirePersonnelArtifactPolicy(ctx, personnelId, 'read');
}

async function requirePersonnelArtifactPolicy(
	ctx: UseCaseContext,
	personnelId: string,
	accessType: 'read' | 'write'
): Promise<void> {
	let orgCache = artifactAccessCache.get(ctx);
	if (!orgCache) {
		orgCache = new Map();
		artifactAccessCache.set(ctx, orgCache);
	}

	const cacheKey = `${ctx.auth.orgId}:${personnelId}:${accessType}`;
	const cached = orgCache.get(cacheKey);
	if (cached) return cached;

	const accessCheck = requirePersonnelArtifactAccessUncached(ctx, personnelId, accessType);
	orgCache.set(cacheKey, accessCheck);
	return accessCheck;
}

async function requirePersonnelArtifactAccessUncached(
	ctx: UseCaseContext,
	personnelId: string,
	accessType: 'read' | 'write'
): Promise<void> {
	const person = await (ctx.rawStore ?? ctx.store).findOne<{ id: string; group_id: string | null }>(
		'personnel',
		ctx.auth.orgId,
		{ id: personnelId },
		'id, group_id'
	);
	if (!person) fail(404, 'Personnel record not found');

	await requireFeaturePolicy(
		ctx,
		accessType === 'read'
			? POLICY_ACTION_CATALOG.personnel.readSensitiveRecords
			: POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(person.group_id),
		'personnel',
		personnelId
	);
	await ctx.scope.requireGroupAccess(personnelId);
}

function compact(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function labelForRow(row: MembershipContributorRow): string {
	const fullName =
		compact(row.display_name) ||
		compact(row.full_name) ||
		compact(row.name) ||
		[compact(row.first_name), compact(row.last_name)].filter(Boolean).join(' ');
	return fullName || compact(row.username) || compact(row.email) || row.user_id;
}

export async function loadPersonnelContributorLabels(
	ctx: UseCaseContext,
	contributorIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
	const userIds = [...new Set(contributorIds.filter((id): id is string => !!id && UUID_PATTERN.test(id)))];
	if (userIds.length === 0) return new Map();

	const rows = await (ctx.rawStore ?? ctx.store).findMany<MembershipContributorRow>(
		'organization_memberships',
		ctx.auth.orgId,
		undefined,
		{
			inFilters: { user_id: userIds }
		}
	);

	return new Map(rows.map((row) => [row.user_id, labelForRow(row)]));
}

export function resolveContributorLabel(labels: Map<string, string>, value: string | null | undefined): string {
	if (!value) return 'Unknown leader';
	return labels.get(value) ?? value;
}

export async function listArtifacts<TRow, TDto>(
	ctx: UseCaseContext,
	spec: PersonnelArtifactSpec<TRow, TDto>,
	personnelId: string,
	options: { limit?: number; archived?: boolean } = {}
): Promise<TDto[]> {
	await requirePersonnelArtifactReadAccess(ctx, personnelId);

	const clause = spec.listClause(options, personnelId);
	const { filters, ...findOptions } = clause;
	const rows = await ctx.store.findMany<TRow>(
		spec.table,
		ctx.auth.orgId,
		filters,
		Object.keys(findOptions).length > 0 ? findOptions : undefined
	);
	const labels = await loadPersonnelContributorLabels(
		ctx,
		rows.map((row) => row[spec.contributorColumn] as string | null | undefined)
	);
	return rows.map((row) => spec.map(row, labels));
}

export async function loadArtifact<TRow, TDto>(
	ctx: UseCaseContext,
	spec: PersonnelArtifactSpec<TRow, TDto>,
	personnelId: string,
	id: string
): Promise<TRow> {
	await requirePersonnelArtifactAccess(ctx, personnelId);
	const row = await ctx.store.findOne<TRow>(spec.table, ctx.auth.orgId, {
		id,
		personnel_id: personnelId
	});
	if (!row) fail(404, `${spec.noun} not found`);
	return row;
}

export async function archiveArtifact<TRow, TDto>(
	ctx: UseCaseContext,
	spec: PersonnelArtifactSpec<TRow, TDto>,
	input: { personnelId: string; id: string }
): Promise<TDto> {
	const existing = await loadArtifact(ctx, spec, input.personnelId, input.id);
	if (spec.isArchived(existing)) fail(409, `${spec.noun} is already archived`);
	if (!spec.archivePatch) throw new Error(`${spec.noun} does not use lifecycle archive`);

	const row = await ctx.store.update<TRow>(
		spec.table,
		ctx.auth.orgId,
		input.id,
		spec.archivePatch(new Date().toISOString())
	);
	ctx.audit.log({ action: `${spec.auditPrefix}.archived`, resourceType: 'personnel', resourceId: input.personnelId });
	return mapSingleArtifact(ctx, spec, row);
}

export async function restoreArtifact<TRow, TDto>(
	ctx: UseCaseContext,
	spec: PersonnelArtifactSpec<TRow, TDto>,
	input: { personnelId: string; id: string }
): Promise<TDto> {
	await loadArtifact(ctx, spec, input.personnelId, input.id);
	if (!spec.restorePatch) throw new Error(`${spec.noun} does not use lifecycle restore`);

	const row = await ctx.store.update<TRow>(spec.table, ctx.auth.orgId, input.id, spec.restorePatch());
	ctx.audit.log({ action: `${spec.auditPrefix}.restored`, resourceType: 'personnel', resourceId: input.personnelId });
	return mapSingleArtifact(ctx, spec, row);
}

export async function deleteArtifact<TRow, TDto>(
	ctx: UseCaseContext,
	spec: PersonnelArtifactSpec<TRow, TDto>,
	input: { personnelId: string; id: string },
	hooks: { onDeleted?(row: TRow): Promise<void> } = {}
): Promise<void> {
	const row = await loadArtifact(ctx, spec, input.personnelId, input.id);
	if (!spec.isArchived(row)) fail(409, `Archive ${spec.nounPlural} before deleting them`);

	await ctx.store.delete(spec.table, ctx.auth.orgId, input.id);
	await hooks.onDeleted?.(row);
	ctx.audit.log({ action: `${spec.auditPrefix}.deleted`, resourceType: 'personnel', resourceId: input.personnelId });
}

async function mapSingleArtifact<TRow, TDto>(
	ctx: UseCaseContext,
	spec: PersonnelArtifactSpec<TRow, TDto>,
	row: TRow
): Promise<TDto> {
	const labels = await loadPersonnelContributorLabels(ctx, [row[spec.contributorColumn] as string | null | undefined]);
	return spec.map(row, labels);
}

function fileNameFromPath(path: string): string {
	return path.split(/[\\/]/).pop() ?? 'document';
}

export function mapCounselingRow(
	row: CounselingRecordRow,
	contributorLabels = new Map<string, string>()
): PersonnelCounselingRecord {
	const title = row.title ?? row.subject ?? 'Uploaded counseling PDF';
	const summary = row.summary ?? row.notes ?? undefined;
	const createdAt = row.created_at ?? `${row.date_conducted}T00:00:00Z`;
	return {
		id: row.id,
		personnelId: row.personnel_id,
		dateConducted: row.date_conducted,
		title,
		summary: summary || undefined,
		status: row.archived_at ? 'archived' : row.file_path ? 'uploaded' : 'needs-title',
		uploadedBy: resolveContributorLabel(contributorLabels, row.uploaded_by ?? 'Leader upload'),
		fileName: row.file_path ? fileNameFromPath(row.file_path) : `${row.id}.pdf`,
		createdAt,
		archivedAt: row.archived_at ?? null
	};
}

export function mapDocumentRow(
	row: PersonnelDocumentRow,
	contributorLabels = new Map<string, string>()
): PersonnelDocument {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		title: row.title,
		fileName: fileNameFromPath(row.file_path),
		fileSizeBytes: row.file_size_bytes,
		contentType: row.content_type,
		uploadedBy: resolveContributorLabel(contributorLabels, row.uploaded_by),
		createdAt: row.created_at ?? new Date().toISOString(),
		archivedAt: row.archived_at ?? null
	};
}

export function mapFollowUpRow(row: FollowUpRow, contributorLabels = new Map<string, string>()): PersonnelFollowUp {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		title: row.title,
		notes: row.notes ?? '',
		dueDate: row.due_date,
		status: row.status,
		createdBy: resolveContributorLabel(contributorLabels, row.created_by),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at,
		archivedAt: row.archived_at ?? null
	};
}

const binaryArchivePatch = (archivedAt: string) => ({ archived_at: archivedAt });
const binaryRestorePatch = () => ({ archived_at: null });

export const PERSONNEL_LEADER_NOTE_SPEC: PersonnelArtifactSpec<LeaderNoteRow, PersonnelLeaderNote> = {
	table: 'leader_notes',
	noun: 'Leader note',
	nounPlural: 'leader notes',
	auditPrefix: 'personnel.leader_note',
	contributorColumn: 'author',
	map: mapLeaderNoteRow,
	isArchived: (row) => !!row.archived_at,
	listClause: ({ archived, limit }, personnelId) => ({
		filters: { personnel_id: personnelId },
		orderBy: [{ column: 'created_at', ascending: false }],
		isNull: { archived_at: !archived },
		limit
	}),
	archivePatch: binaryArchivePatch,
	restorePatch: binaryRestorePatch,
	ownedArchive: {
		archivePatch: binaryArchivePatch,
		restoreFilters: (personnelArchivedAt) => ({ archived_at: personnelArchivedAt }),
		restorePatch: binaryRestorePatch
	}
};

export const PERSONNEL_COUNSELING_RECORD_SPEC: PersonnelArtifactSpec<CounselingRecordRow, PersonnelCounselingRecord> = {
	table: 'counseling_records',
	noun: 'Counseling record',
	nounPlural: 'counseling records',
	auditPrefix: 'personnel.counseling_record',
	contributorColumn: 'uploaded_by',
	map: mapCounselingRow,
	isArchived: (row) => !!row.archived_at,
	listClause: ({ archived, limit }, personnelId) => ({
		filters: { personnel_id: personnelId },
		orderBy: [
			{ column: 'date_conducted', ascending: false },
			{ column: 'created_at', ascending: false }
		],
		isNull: { archived_at: !archived },
		limit
	}),
	archivePatch: binaryArchivePatch,
	restorePatch: binaryRestorePatch,
	ownedArchive: {
		archivePatch: binaryArchivePatch,
		restoreFilters: (personnelArchivedAt) => ({ archived_at: personnelArchivedAt }),
		restorePatch: binaryRestorePatch
	}
};

export const PERSONNEL_DOCUMENT_SPEC: PersonnelArtifactSpec<PersonnelDocumentRow, PersonnelDocument> = {
	table: 'personnel_documents',
	noun: 'Document',
	nounPlural: 'documents',
	auditPrefix: 'personnel.document',
	contributorColumn: 'uploaded_by',
	map: mapDocumentRow,
	isArchived: (row) => !!row.archived_at,
	listClause: ({ archived, limit }, personnelId) => ({
		filters: { personnel_id: personnelId },
		orderBy: [{ column: 'created_at', ascending: false }],
		isNull: { archived_at: !archived },
		limit
	}),
	archivePatch: binaryArchivePatch,
	restorePatch: binaryRestorePatch,
	ownedArchive: {
		archivePatch: binaryArchivePatch,
		restoreFilters: (personnelArchivedAt) => ({ archived_at: personnelArchivedAt }),
		restorePatch: binaryRestorePatch
	}
};

export const PERSONNEL_FOLLOW_UP_SPEC: PersonnelArtifactSpec<FollowUpRow, PersonnelFollowUp> = {
	table: 'personnel_follow_ups',
	noun: 'Follow-up',
	nounPlural: 'follow-ups',
	auditPrefix: 'personnel.follow_up',
	contributorColumn: 'created_by',
	map: mapFollowUpRow,
	isArchived: (row) => row.status === 'archived',
	listClause: ({ archived, limit }, personnelId) => ({
		filters: { personnel_id: personnelId, ...(archived ? { status: 'archived' } : {}) },
		orderBy: [
			{ column: 'status', ascending: false },
			...(archived ? [{ column: 'archived_at', ascending: false }] : []),
			{ column: 'created_at', ascending: false }
		],
		...(archived ? {} : { notInFilters: { status: ['archived'] } }),
		limit
	}),
	ownedArchive: {
		filters: { status: 'open' },
		archivePatch: (archivedAt) => ({ status: 'archived', archived_at: archivedAt }),
		restoreFilters: (personnelArchivedAt) => ({ archived_at: personnelArchivedAt }),
		restorePatch: () => ({ status: 'open', archived_at: null })
	}
};

type PersonnelArtifactSpecRegistry = {
	[K in PersonnelArtifactKind]: K extends 'follow-up'
		? PersonnelArtifactSpec<FollowUpRow, PersonnelFollowUp>
		: K extends 'counseling'
			? PersonnelArtifactSpec<CounselingRecordRow, PersonnelCounselingRecord>
			: K extends 'document'
				? PersonnelArtifactSpec<PersonnelDocumentRow, PersonnelDocument>
				: K extends 'note'
					? PersonnelArtifactSpec<LeaderNoteRow, PersonnelLeaderNote>
					: never;
};

export const PERSONNEL_ARTIFACT_SPECS: PersonnelArtifactSpecRegistry = {
	'follow-up': PERSONNEL_FOLLOW_UP_SPEC,
	counseling: PERSONNEL_COUNSELING_RECORD_SPEC,
	document: PERSONNEL_DOCUMENT_SPEC,
	note: PERSONNEL_LEADER_NOTE_SPEC
};

export function personnelOwnedArchiveSpecs(): PersonnelOwnedArchiveSpec[] {
	return Object.values(PERSONNEL_ARTIFACT_SPECS).map((spec) => {
		if (!spec.ownedArchive) throw new Error(`${spec.noun} is missing owned artifact archive rules`);
		return {
			table: spec.table,
			filters: spec.ownedArchive.filters,
			archivePatch: (archivedAt) => spec.ownedArchive!.archivePatch(archivedAt) as Record<string, unknown>,
			restoreFilters: spec.ownedArchive.restoreFilters,
			restorePatch: () => spec.ownedArchive!.restorePatch() as Record<string, unknown>
		};
	});
}

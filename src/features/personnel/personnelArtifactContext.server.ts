import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import type { PersonnelArtifactWriter } from './contracts';

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

export interface PersonnelArtifactsContext {
	actor: OrganizationAccessGrant;
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
	audit: PolicyAuditSink;
	persistence: {
		findPersonnelGroup(personnelId: string): Promise<string | null | undefined>;
		listCounselingRecords(
			personnelId: string,
			options: { archived: boolean; limit?: number }
		): Promise<CounselingRecordRow[]>;
		listDocuments(personnelId: string, options: { archived: boolean; limit?: number }): Promise<PersonnelDocumentRow[]>;
		listFollowUps(personnelId: string, options: { archived: boolean; limit?: number }): Promise<FollowUpRow[]>;
		findDocument(personnelId: string, documentId: string): Promise<PersonnelDocumentRow | null>;
	};
	writerFor(personnelId: string): Promise<PersonnelArtifactWriter>;
	contributorLabels(userIds: string[]): Promise<Map<string, string>>;
	documentStorageCapBytes(): Promise<number>;
	createDocumentSignedUrl(filePath: string, expiresInSeconds: number): Promise<string>;
}

// The same request context is shared by the three Dashboard reads. Cache rejection
// as well as admission, and keep write admission independent from sensitive reads.
const accessCache = new WeakMap<PersonnelArtifactsContext, Map<string, Promise<void>>>();

export async function requirePersonnelArtifactAccess(
	ctx: PersonnelArtifactsContext,
	personnelId: string,
	purpose: 'read' | 'write'
): Promise<void> {
	let cache = accessCache.get(ctx);
	if (!cache) {
		cache = new Map();
		accessCache.set(ctx, cache);
	}
	const key = `${ctx.actor.orgId}:${personnelId}:${purpose}`;
	let check = cache.get(key);
	if (!check) {
		check = requireAccessUncached(ctx, personnelId, purpose);
		cache.set(key, check);
	}
	return check;
}

async function requireAccessUncached(
	ctx: PersonnelArtifactsContext,
	personnelId: string,
	purpose: 'read' | 'write'
): Promise<void> {
	const groupId = await ctx.persistence.findPersonnelGroup(personnelId);
	if (groupId === undefined) fail(404, 'Personnel record not found');
	await requireFeaturePolicy(
		{ auth: ctx.actor, audit: ctx.audit },
		purpose === 'read'
			? POLICY_ACTION_CATALOG.personnel.readSensitiveRecords
			: POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(groupId),
		'personnel',
		personnelId
	);
	await ctx.scope.requireGroupAccess(personnelId);
}

export async function personnelArtifactWriter(
	ctx: PersonnelArtifactsContext,
	personnelId: string
): Promise<PersonnelArtifactWriter> {
	await requirePersonnelArtifactAccess(ctx, personnelId, 'write');
	return ctx.writerFor(personnelId);
}

export function resolveContributorLabel(labels: Map<string, string>, value: string | null | undefined): string {
	if (!value) return 'Unknown leader';
	return labels.get(value) ?? value;
}

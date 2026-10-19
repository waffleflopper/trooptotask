import type { CounselingRecordRow, PersonnelDocumentRow, FollowUpRow } from './personnelArtifactPersistence';
export type { CounselingRecordRow, PersonnelDocumentRow, FollowUpRow } from './personnelArtifactPersistence';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { evaluateFeaturePolicy, policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import type { PersonnelArtifactWriter } from './contracts';

export interface PersonnelArtifactsContext {
	actor: OrganizationAccessGrant;
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
	audit: PolicyAuditSink;
	persistence: {
		findPersonnelGroup(personnelId: string): Promise<string | null | undefined>;
		listCounselingRecords(
			personnelId: string,
			options: { archived: boolean; limit?: number; onOrBefore?: string }
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

/** Whether a write may answer with the sensitive record it changed. */
export async function canReadSensitivePersonnelArtifacts(
	ctx: PersonnelArtifactsContext,
	personnelId: string
): Promise<boolean> {
	const groupId = await ctx.persistence.findPersonnelGroup(personnelId);
	if (groupId === undefined) return false;
	const decision = await evaluateFeaturePolicy(
		{ auth: ctx.actor },
		POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
		policyResourceForGroup(groupId)
	);
	return decision.allowed;
}

export async function personnelArtifactWriter(
	ctx: PersonnelArtifactsContext,
	personnelId: string
): Promise<PersonnelArtifactWriter> {
	await requirePersonnelArtifactAccess(ctx, personnelId, 'write');
	return ctx.writerFor(personnelId);
}

/** The label of the member behind a database-stamped column; null when nobody was recorded or the member is unknown. */
export function optionalContributorLabel(labels: Map<string, string>, value: string | null | undefined): string | null {
	return value ? (labels.get(value) ?? null) : null;
}

/**
 * Labels for the members a row names. `people` are required: a failed lookup fails the read. `stamped` are the
 * database-stamped completer and archiver ids: a failed lookup leaves them unnamed instead of failing the read.
 */
export async function contributorLabelsWithStamps(
	ctx: Pick<PersonnelArtifactsContext, 'contributorLabels'>,
	people: string[],
	stamped: Array<string | null | undefined>
): Promise<Map<string, string>> {
	const extra = [...new Set(stamped.filter((id): id is string => !!id && !people.includes(id)))];
	const [labels, extraLabels] = await Promise.all([
		ctx.contributorLabels(people),
		extra.length > 0 ? ctx.contributorLabels(extra).catch(() => new Map<string, string>()) : new Map<string, string>()
	]);
	return new Map([...extraLabels, ...labels]);
}

export function resolveContributorLabel(labels: Map<string, string>, value: string | null | undefined): string {
	if (!value) return 'Unknown leader';
	return labels.get(value) ?? value;
}

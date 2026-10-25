import type {
	CounselingRecordRow,
	PersonnelDocumentRow,
	PersonnelDocumentUsage,
	FollowUpRow
} from './personnelArtifactPersistence';
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
			options: { archived: boolean; limit?: number; offset?: number; onOrBefore?: string }
		): Promise<CounselingRecordRow[]>;
		countActiveCounselingRecords(personnelId: string): Promise<number>;
		listActiveCounselingDates(personnelId: string, since: string): Promise<string[]>;
		findCounseling(personnelId: string, counselingId: string): Promise<CounselingRecordRow | null>;
		listDocuments(
			personnelId: string,
			options: { archived: boolean; limit?: number; offset?: number }
		): Promise<PersonnelDocumentRow[]>;
		summarizeActiveDocuments(personnelId: string): Promise<PersonnelDocumentUsage>;
		listFollowUps(personnelId: string, options: { archived: boolean; limit?: number }): Promise<FollowUpRow[]>;
		listOpenFollowUps(personnelId: string, limit: number): Promise<{ rows: FollowUpRow[]; total: number }>;
		findDocument(personnelId: string, documentId: string): Promise<PersonnelDocumentRow | null>;
	};
	writerFor(personnelId: string): Promise<PersonnelArtifactWriter>;
	contributorLabels(userIds: string[]): Promise<Map<string, string>>;
	documentStorageCapBytes(): Promise<number>;
	createDocumentSignedUrl(filePath: string, expiresInSeconds: number): Promise<string>;
	createCounselingSignedUrl(filePath: string, expiresInSeconds: number): Promise<string>;
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

/** Whether a write may answer with the sensitive record it changed. It runs after the commit, so a failed check answers no. */
export async function canReadSensitivePersonnelArtifacts(
	ctx: {
		actor: OrganizationAccessGrant;
		persistence: { findPersonnelGroup(personnelId: string): Promise<string | null | undefined> };
	},
	personnelId: string
): Promise<boolean> {
	try {
		const groupId = await ctx.persistence.findPersonnelGroup(personnelId);
		if (groupId === undefined) return false;
		const decision = await evaluateFeaturePolicy(
			{ auth: ctx.actor },
			POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResourceForGroup(groupId)
		);
		return decision.allowed;
	} catch {
		return false;
	}
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

export const UNNAMED_LEADER = 'Unknown leader';

/**
 * Labels for a write response. The write has already committed, so a failed lookup leaves the `people` unnamed
 * instead of reporting the save as failed and inviting a retry that would duplicate it.
 */
export async function contributorLabelsForWriteResponse(
	ctx: Pick<PersonnelArtifactsContext, 'contributorLabels'>,
	people: string[],
	stamped: Array<string | null | undefined> = []
): Promise<Map<string, string>> {
	try {
		return await contributorLabelsWithStamps(ctx, people, stamped);
	} catch {
		return new Map(people.map((id) => [id, UNNAMED_LEADER]));
	}
}

export function resolveContributorLabel(labels: Map<string, string>, value: string | null | undefined): string {
	if (!value) return UNNAMED_LEADER;
	return labels.get(value) ?? value;
}

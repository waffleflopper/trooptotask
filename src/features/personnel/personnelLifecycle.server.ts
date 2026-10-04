import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	evaluateFeaturePolicy,
	policyResourceForGroup,
	requireFeaturePolicy,
	requireGovernancePolicy
} from '$lib/access/index.server';
import type { PersonnelArtifactWritePort } from './contracts';
import { PersonnelEntity } from './personnelEntity.server';
import { archivePersonnelOwnedArtifacts, restorePersonnelOwnedArtifacts } from './personnelArchiveCascade.server';

interface PersonnelLifecycleContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	store: {
		findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
		findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: { inFilters?: Record<string, string[]>; select?: string }
		): Promise<T[]>;
		update<T>(table: string, orgId: string, id: string, patch: Record<string, unknown>): Promise<T>;
		delete(table: string, orgId: string, id: string): Promise<void>;
	};
	rawStore?: Pick<PersonnelLifecycleContext['store'], 'findOne'>;
	personnelArtifactWrites?: Pick<PersonnelArtifactWritePort, 'forPeople'>;
}

interface PersonnelLifecycleRecord {
	rank: string;
	first_name: string;
	last_name: string;
	group_id: string | null;
	archived_at: string | null;
}

interface ArchiveCandidate extends PersonnelLifecycleRecord {
	id: string;
}

type PersonnelArchiveOutcome =
	| { kind: 'archived' }
	| { kind: 'requiresApproval'; resourceDescription: string }
	| { kind: 'error'; message: string };

interface PreparedPersonnelArchiveBatch {
	readonly ids: readonly string[];
	archive(id: string): Promise<PersonnelArchiveOutcome>;
	finish(): Promise<void>;
}

const entity = PersonnelEntity;
const AUDIT_RESOURCE = 'personnel';

function lifecycleLookupStore(ctx: PersonnelLifecycleContext) {
	return ctx.rawStore ?? ctx.store;
}

function personnelName(person: Pick<PersonnelLifecycleRecord, 'rank' | 'last_name' | 'first_name'>): string {
	return `${person.rank} ${person.last_name}, ${person.first_name}`;
}

export async function archivePersonnelRecord(ctx: PersonnelLifecycleContext, id: string) {
	const currentRecord = await lifecycleLookupStore(ctx).findOne<{
		group_id: string | null;
		archived_at: string | null;
	}>(entity.table, ctx.auth.orgId, { id });

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(currentRecord?.group_id),
		AUDIT_RESOURCE,
		id
	);

	const directArchiveDecision = await evaluateFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.archiveRecords,
		policyResourceForGroup(currentRecord?.group_id)
	);
	if (!directArchiveDecision.allowed && directArchiveDecision.reasonCode === 'denied:missing-capability') {
		return { requiresApproval: true };
	}
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.archiveRecords,
		policyResourceForGroup(currentRecord?.group_id),
		AUDIT_RESOURCE,
		id
	);

	const archivedAt = currentRecord?.archived_at ?? new Date().toISOString();
	if (!currentRecord?.archived_at) {
		await ctx.store.update(entity.table, ctx.auth.orgId, id, { archived_at: archivedAt });
	}
	// A retry completes only remaining active artifacts under the original event.
	await archivePersonnelOwnedArtifacts(ctx, [id], archivedAt);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.archived`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});
}

export async function restorePersonnelRecord(ctx: PersonnelLifecycleContext, id: string) {
	if (!id) fail(400, 'Missing id');

	const person = await lifecycleLookupStore(ctx).findOne<PersonnelLifecycleRecord>(entity.table, ctx.auth.orgId, {
		id
	});

	if (!person) fail(404, 'Personnel not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.restoreRecords,
		policyResourceForGroup(person.group_id),
		AUDIT_RESOURCE,
		id
	);

	if (!person.archived_at) fail(400, 'Personnel is not archived');

	const personnelArchivedAt = person.archived_at;
	await restorePersonnelOwnedArtifacts(ctx, [id], personnelArchivedAt);
	// Retain the event until every artifact restore is acknowledged, so a retry can finish it.
	await ctx.store.update(entity.table, ctx.auth.orgId, id, { archived_at: null });

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.restored`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id,
		details: {
			name: personnelName(person)
		}
	});

	return { success: true };
}

export async function permanentlyDeletePersonnelRecord(
	ctx: PersonnelLifecycleContext,
	id: string,
	notifyPermanentlyDeleted: (name: string) => Promise<void>
) {
	if (!id) fail(400, 'Missing id');

	const person = await lifecycleLookupStore(ctx).findOne<PersonnelLifecycleRecord>(entity.table, ctx.auth.orgId, {
		id
	});

	if (!person) fail(404, 'Personnel not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
		policyResourceForGroup(person.group_id),
		AUDIT_RESOURCE,
		id
	);

	if (!person.archived_at) fail(400, 'Can only permanently delete archived personnel');

	await ctx.store.delete(entity.table, ctx.auth.orgId, id);

	const name = personnelName(person);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.permanently_deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id,
		details: { name }
	});

	await notifyPermanentlyDeleted(name);

	return { success: true };
}

/** Apply a Personnel effect after the owning request workflow admits an Organization reviewer. */
export async function archiveApprovedPersonnelRecord(ctx: PersonnelLifecycleContext, id: string): Promise<void> {
	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);
	const person = await lifecycleLookupStore(ctx).findOne<{ archived_at: string | null }>(
		entity.table,
		ctx.auth.orgId,
		{ id },
		'archived_at'
	);
	if (!person) fail(404, 'Personnel not found');
	const archivedAt = person.archived_at ?? new Date().toISOString();
	if (!person.archived_at) {
		await ctx.store.update(entity.table, ctx.auth.orgId, id, { archived_at: archivedAt });
	}
	await archivePersonnelOwnedArtifacts(ctx, [id], archivedAt);
}

/** Keep candidate admission and grouped source effects private while delivery handles approvals/results. */
export async function preparePersonnelArchiveBatch(
	ctx: PersonnelLifecycleContext,
	personnelIds: string[]
): Promise<PreparedPersonnelArchiveBatch> {
	const ids = [...new Set(personnelIds)];
	const candidates = ids.length
		? await ctx.store.findMany<ArchiveCandidate>(entity.table, ctx.auth.orgId, undefined, {
				inFilters: { id: ids },
				select: 'id, rank, first_name, last_name, group_id, archived_at'
			})
		: [];
	const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	const archivedAt = new Date().toISOString();
	const archivedIds: string[] = [];
	const artifactGroups = new Map<string, string[]>();

	function includeArtifacts(id: string, timestamp: string) {
		const group = artifactGroups.get(timestamp);
		if (group) group.push(id);
		else artifactGroups.set(timestamp, [id]);
		archivedIds.push(id);
	}

	return {
		ids,
		async archive(id) {
			const person = candidateById.get(id);
			if (!person) return { kind: 'error', message: 'Personnel not found' };
			const resource = policyResourceForGroup(person.group_id);

			if (person.archived_at) {
				const manageDecision = await evaluateFeaturePolicy(
					ctx,
					POLICY_ACTION_CATALOG.personnel.manageRecords,
					resource
				);
				const archiveDecision = await evaluateFeaturePolicy(
					ctx,
					POLICY_ACTION_CATALOG.personnel.archiveRecords,
					resource
				);
				if (!manageDecision.allowed || !archiveDecision.allowed) {
					return { kind: 'error', message: 'Personnel is already archived' };
				}
				includeArtifacts(id, person.archived_at);
				return { kind: 'archived' };
			}

			await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.manageRecords, resource, AUDIT_RESOURCE, id);
			const directArchiveDecision = await evaluateFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.archiveRecords,
				resource
			);
			if (!directArchiveDecision.allowed && directArchiveDecision.reasonCode === 'denied:missing-capability') {
				return { kind: 'requiresApproval', resourceDescription: `Archive ${personnelName(person)}` };
			}
			await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.archiveRecords, resource, AUDIT_RESOURCE, id);
			await ctx.store.update(entity.table, ctx.auth.orgId, id, { archived_at: archivedAt });
			includeArtifacts(id, archivedAt);
			return { kind: 'archived' };
		},
		async finish() {
			if (archivedIds.length === 0) return;
			for (const [timestamp, ids] of artifactGroups) {
				await archivePersonnelOwnedArtifacts(ctx, ids, timestamp);
			}
			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.bulk_archived`,
				resourceType: AUDIT_RESOURCE,
				details: { count: archivedIds.length, ids: archivedIds }
			});
		}
	};
}

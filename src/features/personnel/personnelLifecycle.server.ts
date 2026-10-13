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
import type { PersonnelArtifactWritePort, PersonnelLifecycleReference, PersonnelRecordPersistence } from './contracts';
import { archivePersonnelOwnedArtifacts, restorePersonnelOwnedArtifacts } from './personnelArchiveCascade.server';

interface PersonnelLifecycleContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	personnel: Pick<PersonnelRecordPersistence, 'listArchiveCandidates' | 'setArchivedAt' | 'delete'>;
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'findWriteReference' | 'findArchiveEvent'>;
	personnelArtifactWrites?: Pick<PersonnelArtifactWritePort, 'forPeople'>;
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

const AUDIT_RESOURCE = 'personnel';

function personnelName(person: Pick<PersonnelLifecycleReference, 'rank' | 'lastName' | 'firstName'>): string {
	return `${person.rank} ${person.lastName}, ${person.firstName}`;
}

export async function archivePersonnelRecord(ctx: PersonnelLifecycleContext, id: string) {
	const currentRecord = await ctx.organizationPersonnel.findWriteReference(id);

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(currentRecord?.groupId),
		AUDIT_RESOURCE,
		id
	);

	const directArchiveDecision = await evaluateFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.archiveRecords,
		policyResourceForGroup(currentRecord?.groupId)
	);
	if (!directArchiveDecision.allowed && directArchiveDecision.reasonCode === 'denied:missing-capability') {
		return { requiresApproval: true };
	}
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.archiveRecords,
		policyResourceForGroup(currentRecord?.groupId),
		AUDIT_RESOURCE,
		id
	);

	const archivedAt = currentRecord?.archivedAt ?? new Date().toISOString();
	if (!currentRecord?.archivedAt) {
		await ctx.personnel.setArchivedAt(id, archivedAt);
	}
	// A retry completes only remaining active artifacts under the original event.
	await archivePersonnelOwnedArtifacts(ctx, [id], archivedAt);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.archived`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});
}

/** Describes an archive request from the Person the requester may manage. */
export async function describePersonnelArchiveRequest(
	ctx: Pick<PersonnelLifecycleContext, 'auth' | 'audit'> & {
		personnel: Pick<PersonnelRecordPersistence, 'findWriteReference'>;
	},
	id: string
): Promise<{ description: string; url: string }> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		{ kind: 'unscoped' },
		AUDIT_RESOURCE,
		id
	);
	const person = await ctx.personnel.findWriteReference(id);
	if (!person) fail(404, 'Personnel not found');
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(person.groupId),
		AUDIT_RESOURCE,
		id
	);
	if (person.archivedAt) fail(400, 'Personnel is already archived');
	return { description: `Archive ${personnelName(person)}`, url: `/org/${ctx.auth.orgId}/personnel` };
}

export async function restorePersonnelRecord(ctx: PersonnelLifecycleContext, id: string) {
	if (!id) fail(400, 'Missing id');

	const person = await ctx.organizationPersonnel.findWriteReference(id);

	if (!person) fail(404, 'Personnel not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.restoreRecords,
		policyResourceForGroup(person.groupId),
		AUDIT_RESOURCE,
		id
	);

	if (!person.archivedAt) fail(400, 'Personnel is not archived');

	const personnelArchivedAt = person.archivedAt;
	await restorePersonnelOwnedArtifacts(ctx, [id], personnelArchivedAt);
	// Retain the event until every artifact restore is acknowledged, so a retry can finish it.
	await ctx.personnel.setArchivedAt(id, null);

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

	const person = await ctx.organizationPersonnel.findWriteReference(id);

	if (!person) fail(404, 'Personnel not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
		policyResourceForGroup(person.groupId),
		AUDIT_RESOURCE,
		id
	);

	if (!person.archivedAt) fail(400, 'Can only permanently delete archived personnel');

	await ctx.personnel.delete(id);

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
	const person = await ctx.organizationPersonnel.findArchiveEvent(id);
	if (!person) fail(404, 'Personnel not found');
	const archivedAt = person.archivedAt ?? new Date().toISOString();
	if (!person.archivedAt) {
		await ctx.personnel.setArchivedAt(id, archivedAt);
	}
	await archivePersonnelOwnedArtifacts(ctx, [id], archivedAt);
}

/** Keep candidate admission and grouped source effects private while delivery handles approvals/results. */
export async function preparePersonnelArchiveBatch(
	ctx: PersonnelLifecycleContext,
	personnelIds: string[]
): Promise<PreparedPersonnelArchiveBatch> {
	const ids = [...new Set(personnelIds)];
	const candidates = await ctx.personnel.listArchiveCandidates(ids);
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
			const resource = policyResourceForGroup(person.groupId);

			if (person.archivedAt) {
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
				includeArtifacts(id, person.archivedAt);
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
			await ctx.personnel.setArchivedAt(id, archivedAt);
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

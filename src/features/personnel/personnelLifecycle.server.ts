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
import {
	deletionBlockedMessage,
	type PersonnelDeletionReferencesPort,
	type PersonnelLifecycleCommandPort,
	type PersonnelLifecycleReference,
	type PersonnelRecordPersistence
} from './contracts';

interface PersonnelLifecycleContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	personnel: Pick<PersonnelRecordPersistence, 'listArchiveCandidates' | 'delete'>;
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'findWriteReference'>;
	personnelLifecycle: PersonnelLifecycleCommandPort;
}

type PersonnelArchiveOutcome =
	| { kind: 'archived' }
	| { kind: 'requiresApproval'; resourceDescription: string }
	| { kind: 'error'; message: string };

interface PreparedPersonnelArchiveBatch {
	readonly ids: readonly string[];
	admit(id: string): Promise<PersonnelArchiveOutcome>;
	archiveAdmitted(): Promise<void>;
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

	await ctx.personnelLifecycle.archive([id], new Date().toISOString());

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

	if (!person.archivedAt || !(await ctx.personnelLifecycle.restore(id))) fail(400, 'Personnel is not archived');

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
	ctx: PersonnelLifecycleContext & { deletionReferences: PersonnelDeletionReferencesPort },
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

	const name = personnelName(person);
	const blocked = deletionBlockedMessage(name, 'picked for', await ctx.deletionReferences.find({ personnelId: id }));
	if (blocked) fail(409, blocked);

	await ctx.personnel.delete(id);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.permanently_deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id,
		details: { name }
	});

	await notifyPermanentlyDeleted(name);

	return { success: true };
}

export async function approvePersonnelArchiveRequest(
	ctx: Pick<PersonnelLifecycleContext, 'auth' | 'audit' | 'personnelLifecycle'>,
	requestId: string,
	id: string,
	reviewedAt: string
): Promise<void> {
	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);
	await ctx.personnelLifecycle.approveArchiveRequest(requestId, id, reviewedAt);
}

export async function preparePersonnelArchiveBatch(
	ctx: PersonnelLifecycleContext,
	personnelIds: string[]
): Promise<PreparedPersonnelArchiveBatch> {
	const ids = [...new Set(personnelIds)];
	const candidates = await ctx.personnel.listArchiveCandidates(ids);
	const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	const admittedIds: string[] = [];

	return {
		ids,
		async admit(id) {
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
				admittedIds.push(id);
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
			admittedIds.push(id);
			return { kind: 'archived' };
		},
		async archiveAdmitted() {
			if (admittedIds.length === 0) return;
			await ctx.personnelLifecycle.archive(admittedIds, new Date().toISOString());
			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.bulk_archived`,
				resourceType: AUDIT_RESOURCE,
				details: { count: admittedIds.length, ids: admittedIds }
			});
		}
	};
}

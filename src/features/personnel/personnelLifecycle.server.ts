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

/** The event time an archive wrote and the People it newly archived, which an Undo is bound to. */
export interface PersonnelArchiveEvent {
	archivedAt: string;
	archivedIds: string[];
}

interface PreparedPersonnelArchiveBatch {
	readonly ids: readonly string[];
	admit(id: string): Promise<PersonnelArchiveOutcome>;
	/** Resolves null when nothing was admitted. */
	archiveAdmitted(): Promise<PersonnelArchiveEvent | null>;
}

const AUDIT_RESOURCE = 'personnel';

function personnelName(person: Pick<PersonnelLifecycleReference, 'rank' | 'lastName' | 'firstName'>): string {
	return `${person.rank} ${person.lastName}, ${person.firstName}`;
}

/** `archivedAt` is null when the Person was already archived, so there is nothing this call can take back. */
export type PersonnelArchiveResult =
	| { requiresApproval: true }
	| { requiresApproval?: undefined; archivedAt: string | null };

export async function archivePersonnelRecord(
	ctx: PersonnelLifecycleContext,
	id: string
): Promise<PersonnelArchiveResult> {
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

	const archivedAt = new Date().toISOString();
	await ctx.personnelLifecycle.archive([id], archivedAt);
	return { archivedAt: currentRecord?.archivedAt ? null : archivedAt };
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

export async function restorePersonnelRecord(
	ctx: Pick<PersonnelLifecycleContext, 'auth' | 'audit' | 'organizationPersonnel' | 'personnelLifecycle'>,
	id: string
) {
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
	const newlyArchivedIds: string[] = [];

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
			newlyArchivedIds.push(id);
			return { kind: 'archived' };
		},
		async archiveAdmitted() {
			if (admittedIds.length === 0) return null;
			const archivedAt = new Date().toISOString();
			await ctx.personnelLifecycle.archive(admittedIds, archivedAt);
			return { archivedAt, archivedIds: newlyArchivedIds };
		}
	};
}

const RESTORE_CONCURRENCY = 10;

/**
 * Restores People an archive wrote, only while each still carries that archive's event time. The actor needs what
 * archiving directly needed in the Person's Group, which is also what `restore_personnel` checks, not the route-level
 * restore permission. Anyone restored, archived again, moved out of reach or out of the actor's access since is left
 * as they are.
 */
export async function restoreArchivedPersonnel(
	ctx: Pick<PersonnelLifecycleContext, 'auth' | 'audit' | 'personnel' | 'personnelLifecycle'>,
	archive: { archivedAt: string; personnelIds: readonly string[] }
): Promise<{ restoredIds: string[]; changedIds: string[] }> {
	const archivedAt = Date.parse(archive.archivedAt);
	const candidates = new Map(
		(await ctx.personnel.listArchiveCandidates([...archive.personnelIds])).map((candidate) => [candidate.id, candidate])
	);
	const stillArchived = archive.personnelIds.filter((id) => {
		const person = candidates.get(id);
		return person?.archivedAt && Date.parse(person.archivedAt) === archivedAt;
	});
	const groups = [...new Set(stillArchived.map((id) => candidates.get(id)?.groupId ?? null))];
	const reachable = new Map(
		await Promise.all(
			groups.map(
				async (groupId) =>
					[
						groupId,
						(
							await Promise.all(
								[POLICY_ACTION_CATALOG.personnel.manageRecords, POLICY_ACTION_CATALOG.personnel.archiveRecords].map(
									(action) => evaluateFeaturePolicy(ctx, action, policyResourceForGroup(groupId))
								)
							)
						).every((decision) => decision.allowed)
					] as const
			)
		)
	);
	const restorable = stillArchived.filter((id) => reachable.get(candidates.get(id)?.groupId ?? null));

	const restored = new Set<string>();
	for (let start = 0; start < restorable.length; start += RESTORE_CONCURRENCY) {
		const chunk = restorable.slice(start, start + RESTORE_CONCURRENCY);
		const outcomes = await Promise.all(chunk.map((id) => ctx.personnelLifecycle.restore(id)));
		chunk.forEach((id, index) => outcomes[index] && restored.add(id));
	}
	return {
		restoredIds: archive.personnelIds.filter((id) => restored.has(id)),
		changedIds: archive.personnelIds.filter((id) => !restored.has(id))
	};
}

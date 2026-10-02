import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireGovernancePolicy } from '$lib/access/index.server';
import { sanitizeString, validateUUID } from '$lib/server/validation';
import { ORGANIZATION_DELETE_ACTION, type SensitiveActionAuthorizer } from '$features/identity/contracts';
import { sensitiveActionDecisionAuditDetails, throwSensitiveActionFailure } from '$features/identity/index.server';

export type OrganizationCleanupBucket = 'counseling-files' | 'personnel-documents';
export interface OrganizationCleanupFile {
	bucket: OrganizationCleanupBucket;
	path: string;
}

export interface OrganizationDestructionPort {
	findTarget(orgId: string): Promise<{ name: string | null } | null>;
	hasCurrentCleanupAuthority(orgId: string): Promise<boolean>;
	discoverFiles(orgId: string): Promise<OrganizationCleanupFile[]>;
	removeFiles(orgId: string, bucket: OrganizationCleanupBucket, paths: string[]): Promise<void>;
	deleteConfirmedTarget(orgId: string, persistedName: string): Promise<boolean>;
}

type DestructionPorts = Parameters<typeof requireGovernancePolicy>[0] & {
	destruction: OrganizationDestructionPort;
	deletedAudit: Parameters<typeof requireGovernancePolicy>[0]['audit'];
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
};

// Storage and database writes cannot commit together. Never turn an uncertain
// provider result into a success or promise that previously removed bytes return.
async function providerResult<T>(read: () => Promise<T>): Promise<T> {
	try {
		return await read();
	} catch {
		fail(
			409,
			'Deletion could not be completed or confirmed. Some files may already have been removed. Refresh before retrying.'
		);
	}
}

export async function deleteOrganization(
	ports: DestructionPorts,
	input: { confirmName: string }
): Promise<{ success: true }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.deleteOrganization);
	const orgId = ports.auth.orgId;
	if (!validateUUID(orgId)) fail(400, 'Invalid organization ID');
	const target = await providerResult(() => ports.destruction.findTarget(orgId));
	if (!target?.name?.trim()) fail(404, 'Organization not found');
	const persistedName = target.name;
	if (sanitizeString(input.confirmName, 100) !== sanitizeString(persistedName, 100)) {
		fail(400, 'Organization name does not match');
	}

	async function authorizeSensitiveAction() {
		const decision = await ports.sensitiveActionAuthorizer.authorize({
			action: ORGANIZATION_DELETE_ACTION,
			actorUserId: ports.auth.userId,
			target: { type: 'organization', id: orgId }
		});
		const sensitiveAction = sensitiveActionDecisionAuditDetails(decision);
		if (!decision.allowed) {
			ports.audit.log({
				action: 'org.delete_authorization_denied',
				resourceType: 'organization',
				resourceId: orgId,
				details: { sensitiveAction },
				severity: 'warning'
			});
			throwSensitiveActionFailure(decision);
		}
		return sensitiveAction;
	}

	async function requireCurrentTarget() {
		const [current, authorized] = await providerResult(() =>
			Promise.all([ports.destruction.findTarget(orgId), ports.destruction.hasCurrentCleanupAuthority(orgId)])
		);
		if (!authorized) fail(403, 'Current organization owner access is required');
		if (!current || current.name !== persistedName) {
			fail(409, 'The organization changed. Refresh and confirm its current name before retrying.');
		}
	}

	await authorizeSensitiveAction();
	await requireCurrentTarget();
	// Discover completely before effects, so our own removals cannot change pagination.
	const files = await providerResult(() => ports.destruction.discoverFiles(orgId));
	for (const bucket of ['counseling-files', 'personnel-documents'] as const) {
		const paths = files.filter((file) => file.bucket === bucket).map((file) => file.path);
		for (let start = 0; start < paths.length; start += 1000) {
			// Former owners become admins, whose retained live-parent policies may
			// still allow Storage removal. This operation must recheck owner authority.
			await authorizeSensitiveAction();
			await requireCurrentTarget();
			await providerResult(() => ports.destruction.removeFiles(orgId, bucket, paths.slice(start, start + 1000)));
		}
	}

	await requireCurrentTarget();
	const remaining = await providerResult(() => ports.destruction.discoverFiles(orgId));
	if (remaining.length) fail(409, 'Files remain in this organization. Refresh before retrying deletion.');
	await requireCurrentTarget();
	const sensitiveAction = await authorizeSensitiveAction();
	if (!(await providerResult(() => ports.destruction.deleteConfirmedTarget(orgId, persistedName)))) {
		fail(409, 'Organization deletion was not confirmed. Refresh before retrying.');
	}
	ports.deletedAudit.log({
		action: 'org.deleted',
		resourceType: 'organization',
		resourceId: orgId,
		details: { sensitiveAction },
		severity: 'critical'
	});
	return { success: true };
}

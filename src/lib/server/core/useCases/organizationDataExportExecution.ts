import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { completeDataExport, failDataExport, startDataExport } from './dataExportLifecycle';
import { readOrganizationPlanUsage } from './organizationPlanUsage';
import { readEffectivePlanPolicy } from './planPolicy';
import { checkAfterPlanLimitMutation, checkWithinPlanLimit, type PlanGateDenial } from './planPolicyGates';

export type OrganizationDataExportArtifact =
	| {
			kind: 'json';
			body: string;
			filename: string;
			fileSizeBytes: number;
	  }
	| {
			kind: 'workbook';
			buffer: ArrayBuffer;
			filename: string;
			fileSizeBytes: number;
	  };

export type OrganizationDataExportExecutionResult<
	TArtifact extends OrganizationDataExportArtifact = OrganizationDataExportArtifact
> = { status: 'ready'; artifact: TArtifact } | { status: 'rate_limited'; error: string; denial: PlanGateDenial };

interface ExecuteOrganizationDataExportOptions<TArtifact extends OrganizationDataExportArtifact> {
	requestedByEmail: string | undefined;
	auditAction: string;
	buildArtifact: () => Promise<TArtifact>;
}

export async function executeOrganizationDataExport<TArtifact extends OrganizationDataExportArtifact>(
	ctx: UseCaseContext,
	options: ExecuteOrganizationDataExportOptions<TArtifact>
): Promise<OrganizationDataExportExecutionResult<TArtifact>> {
	const orgId = ctx.auth.orgId;
	const userId = ctx.auth.userId;

	if (!userId) fail(403, 'Authenticated user required');

	const lifecyclePorts = { auth: ctx.auth, store: ctx.rawStore };
	const [policy, usage] = await Promise.all([
		readEffectivePlanPolicy(lifecyclePorts),
		readOrganizationPlanUsage(lifecyclePorts)
	]);
	const exportLimit = checkWithinPlanLimit(policy, 'monthly_exports', usage.monthlyExportCount);
	if (!exportLimit.allowed) {
		return {
			status: 'rate_limited',
			error: exportLimit.denial.message,
			denial: exportLimit.denial
		};
	}

	const exportRecord = await startDataExport(lifecyclePorts, { requestedBy: userId });
	const usageAfterCreate = await readOrganizationPlanUsage(lifecyclePorts);
	const postCreateExportLimit = checkAfterPlanLimitMutation(
		policy,
		'monthly_exports',
		usageAfterCreate.monthlyExportCount
	);
	if (!postCreateExportLimit.allowed) {
		await failDataExport(lifecyclePorts, { exportId: exportRecord.exportId });
		return {
			status: 'rate_limited',
			error: postCreateExportLimit.denial.message,
			denial: postCreateExportLimit.denial
		};
	}

	try {
		const artifact = await options.buildArtifact();

		await completeDataExport(lifecyclePorts, {
			exportId: exportRecord.exportId,
			fileSizeBytes: artifact.fileSizeBytes
		});

		ctx.audit.log({ action: options.auditAction, resourceType: 'data_export', resourceId: exportRecord.exportId });

		await ctx.notifications.notifyAdmins(orgId, userId, {
			type: 'bulk_data_exported',
			title: 'Data Exported',
			message: `"${options.requestedByEmail ?? 'A user'}" exported organization data.`
		});

		return { status: 'ready', artifact };
	} catch (err) {
		await failDataExport(lifecyclePorts, { exportId: exportRecord.exportId });
		throw err;
	}
}

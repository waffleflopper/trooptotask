import type { AuditPort } from '$lib/audit/contracts';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import {
	completeDataExport,
	failDataExport,
	startDataExport,
	type DataExportLifecyclePorts
} from './dataExportLifecycle.server';

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
> = { status: 'ready'; artifact: TArtifact };

interface OrganizationDataExportExecutionPorts {
	auth: { readonly orgId: string; readonly userId: string };
	rawStore: DataExportLifecyclePorts['store'];
	audit: AuditPort;
	notifications: Pick<NotificationDeliveryPort, 'notifyAdmins'>;
}

interface ExecuteOrganizationDataExportOptions<TArtifact extends OrganizationDataExportArtifact> {
	requestedByEmail: string | undefined;
	auditAction: string;
	buildArtifact: () => Promise<TArtifact>;
}

export async function executeOrganizationDataExport<TArtifact extends OrganizationDataExportArtifact>(
	ctx: OrganizationDataExportExecutionPorts,
	options: ExecuteOrganizationDataExportOptions<TArtifact>
): Promise<OrganizationDataExportExecutionResult<TArtifact>> {
	const orgId = ctx.auth.orgId;
	const userId = ctx.auth.userId;

	const lifecyclePorts = { auth: ctx.auth, store: ctx.rawStore };
	const exportRecord = await startDataExport(lifecyclePorts, { requestedBy: userId });

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

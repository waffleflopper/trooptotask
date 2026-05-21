import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';
import { completeDataExport, failDataExport, startDataExport } from '$lib/server/core/useCases/dataExportLifecycle';
import { loadOrganizationExportPayload } from '$lib/server/core/useCases/organizationExport';

interface ExportInput {
	email: string | undefined;
}

interface ExportOutput {
	_rateLimited?: boolean;
	error?: string;
	_json?: string;
	_filename?: string;
}

export const _postConfig: RouteConfig<ExportInput, ExportOutput> = {
	permission: 'manageMembers',
	mutation: true,
	parseInput: (event: RequestEvent) => ({
		email: event.locals.user?.email
	}),
	fn: async (ctx, input) => {
		const orgId = ctx.auth.orgId;
		const userId = ctx.auth.userId;

		if (!userId) fail(403, 'Authenticated user required');

		if (isBillingEnabled) {
			const tier = await ctx.subscription.getEffectiveTier();
			const config = TIER_CONFIG[tier.tier];
			const exportCount = await ctx.subscription.getMonthlyExportCount();
			if (exportCount >= config.bulkExportsPerMonth) {
				return {
					_rateLimited: true,
					error: `Export limit reached (${config.bulkExportsPerMonth}/month). Upgrade for unlimited exports.`
				};
			}
		}

		const exportRecord = await startDataExport({ auth: ctx.auth, store: ctx.rawStore }, { requestedBy: userId });

		try {
			const exportData = await loadOrganizationExportPayload(ctx.rawStore, orgId);
			const jsonStr = JSON.stringify(exportData, null, 2);
			const dateStr = exportData.exportedAt.split('T')[0] || new Date().toISOString().split('T')[0];

			await completeDataExport(
				{ auth: ctx.auth, store: ctx.rawStore },
				{
					exportId: exportRecord.exportId,
					fileSizeBytes: new TextEncoder().encode(jsonStr).length
				}
			);

			ctx.audit.log({ action: 'export.created', resourceType: 'data_export', resourceId: exportRecord.exportId });

			await ctx.notifications.notifyAdmins(orgId, userId, {
				type: 'bulk_data_exported',
				title: 'Data Exported',
				message: `"${input.email ?? 'A user'}" exported organization data.`
			});

			return { _json: jsonStr, _filename: `org-export-${orgId}-${dateStr}.json` };
		} catch (err) {
			await failDataExport({ auth: ctx.auth, store: ctx.rawStore }, { exportId: exportRecord.exportId });
			throw err;
		}
	},
	formatOutput: (result) => {
		if (result._rateLimited) {
			return new Response(JSON.stringify({ error: result.error }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return new Response(result._json as string, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${result._filename}"`
			}
		});
	}
};

export const POST = handle(_postConfig);

import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';
import { completeDataExport, failDataExport, startDataExport } from '$lib/server/core/useCases/dataExportLifecycle';
import { loadOrganizationExportPayload } from '$lib/server/core/useCases/organizationExport';
import { buildOrganizationDataExportWorkbook } from '$lib/server/core/useCases/organizationExportWorkbook';
import { workbookBufferResponse, writeWorkbookBuffer } from '$lib/export/workbook';

interface ExcelExportInput {
	email: string | undefined;
}

interface ExcelExportOutput {
	_rateLimited?: boolean;
	error?: string;
	_buffer?: ArrayBuffer;
	_filename?: string;
}

export const _postConfig: RouteConfig<ExcelExportInput, ExcelExportOutput> = {
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
			const exportWorkbook = await buildOrganizationDataExportWorkbook({
				payload: exportData,
				selection: { mode: 'all' }
			});
			const buffer = await writeWorkbookBuffer(exportWorkbook.workbook);

			await completeDataExport(
				{ auth: ctx.auth, store: ctx.rawStore },
				{
					exportId: exportRecord.exportId,
					fileSizeBytes: buffer.byteLength
				}
			);

			ctx.audit.log({ action: 'export.excel_created', resourceType: 'data_export' });

			await ctx.notifications.notifyAdmins(orgId, userId, {
				type: 'bulk_data_exported',
				title: 'Data Exported',
				message: `"${input.email ?? 'A user'}" exported organization data.`
			});

			return { _buffer: buffer, _filename: exportWorkbook.filename };
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
		return workbookBufferResponse(result._buffer as ArrayBuffer, result._filename as string);
	}
};

export const POST = handle(_postConfig);

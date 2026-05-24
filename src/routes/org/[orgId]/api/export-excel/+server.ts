import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { completeDataExport, failDataExport, startDataExport } from '$lib/server/core/useCases/dataExportLifecycle';
import { loadOrganizationExportPayload } from '$lib/server/core/useCases/organizationExport';
import { buildOrganizationDataExportWorkbook } from '$lib/server/core/useCases/organizationExportWorkbook';
import { workbookBufferResponse, writeWorkbookBuffer } from '$lib/export/workbook';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import {
	checkAfterPlanLimitMutation,
	checkWithinPlanLimit,
	type PlanGateDenial
} from '$lib/server/core/useCases/planPolicyGates';

interface ExcelExportInput {
	email: string | undefined;
}

interface ExcelExportOutput {
	_rateLimited?: boolean;
	error?: string;
	denial?: PlanGateDenial;
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

		// Use the shared usage read model so Settings and export enforcement see the same counts.
		const [policy, usage] = await Promise.all([
			readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
			readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore })
		]);
		const exportLimit = checkWithinPlanLimit(policy, 'monthly_exports', usage.monthlyExportCount);
		if (!exportLimit.allowed) {
			return {
				_rateLimited: true,
				error: exportLimit.denial.message,
				denial: exportLimit.denial
			};
		}

		const exportRecord = await startDataExport({ auth: ctx.auth, store: ctx.rawStore }, { requestedBy: userId });
		const usageAfterCreate = await readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore });
		const postCreateExportLimit = checkAfterPlanLimitMutation(
			policy,
			'monthly_exports',
			usageAfterCreate.monthlyExportCount
		);
		if (!postCreateExportLimit.allowed) {
			await failDataExport({ auth: ctx.auth, store: ctx.rawStore }, { exportId: exportRecord.exportId });
			return {
				_rateLimited: true,
				error: postCreateExportLimit.denial.message,
				denial: postCreateExportLimit.denial
			};
		}

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

			ctx.audit.log({
				action: 'export.excel_created',
				resourceType: 'data_export',
				resourceId: exportRecord.exportId
			});

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
			return new Response(JSON.stringify({ error: result.error, denial: result.denial }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return workbookBufferResponse(result._buffer as ArrayBuffer, result._filename as string);
	}
};

export const POST = handle(_postConfig);

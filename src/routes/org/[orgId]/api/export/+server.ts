import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { completeDataExport, failDataExport, startDataExport } from '$lib/server/core/useCases/dataExportLifecycle';
import { loadOrganizationExportPayload } from '$lib/server/core/useCases/organizationExport';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { checkWithinPlanLimit, type PlanGateDenial } from '$lib/server/core/useCases/planPolicyGates';

interface ExportInput {
	email: string | undefined;
}

interface ExportOutput {
	_rateLimited?: boolean;
	error?: string;
	denial?: PlanGateDenial;
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
			return new Response(JSON.stringify({ error: result.error, denial: result.denial }), {
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

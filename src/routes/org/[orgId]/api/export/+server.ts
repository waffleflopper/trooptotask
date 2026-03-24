import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';

interface ExportInput {
	email: string | undefined;
}

interface ExportOutput {
	_rateLimited?: boolean;
	error?: string;
	_json?: string;
	_orgId?: string;
}

export const POST = handle<ExportInput, ExportOutput>({
	permission: 'manageMembers',
	mutation: true,
	parseInput: (event: RequestEvent) => ({
		email: event.locals.user?.email
	}),
	fn: async (ctx, input) => {
		const orgId = ctx.auth.orgId;
		const userId = ctx.auth.userId;

		if (!userId) fail(403, 'Not available in sandbox');

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

		const exportRecord = await ctx.rawStore.insert<{ id: string }>('data_exports', orgId, {
			org_id: orgId,
			requested_by: userId,
			status: 'processing'
		});

		try {
			const [
				personnel,
				groups,
				availabilityEntries,
				trainingTypes,
				personnelTrainings,
				statusTypes,
				assignmentTypes,
				dailyAssignments,
				counselingTypes,
				counselingRecords,
				specialDays,
				onboardingTemplateSteps,
				personnelOnboardings,
				ratingSchemeEntries,
				developmentGoals,
				personnelExtendedInfo,
				dutyRosterHistory
			] = await Promise.all([
				ctx.rawStore.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
					isNull: { archived_at: true }
				}),
				ctx.rawStore.findMany<Record<string, unknown>>('groups', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('availability_entries', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('training_types', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_trainings', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('status_types', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('assignment_types', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('daily_assignments', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('counseling_types', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('counseling_records', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('special_days', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('onboarding_template_steps', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_onboardings', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('rating_scheme_entries', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('development_goals', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('duty_roster_history', orgId)
			]);

			const onboardingIds = personnelOnboardings.map((o) => (o as { id: string }).id);
			const onboardingStepProgress =
				onboardingIds.length > 0
					? await ctx.rawStore.findMany<Record<string, unknown>>('onboarding_step_progress', orgId, undefined, {
							inFilters: { onboarding_id: onboardingIds }
						})
					: [];

			const exportData = {
				exportedAt: new Date().toISOString(),
				organizationId: orgId,
				personnel,
				groups,
				availabilityEntries,
				trainingTypes,
				personnelTrainings,
				statusTypes,
				assignmentTypes,
				dailyAssignments,
				counselingTypes,
				counselingRecords,
				specialDays,
				onboardingTemplateSteps,
				personnelOnboardings,
				onboardingStepProgress,
				ratingSchemeEntries,
				developmentGoals,
				personnelExtendedInfo,
				dutyRosterHistory
			};

			const jsonStr = JSON.stringify(exportData, null, 2);

			await ctx.rawStore.update('data_exports', orgId, exportRecord.id, {
				status: 'completed',
				completed_at: new Date().toISOString(),
				file_size_bytes: new TextEncoder().encode(jsonStr).length
			});

			ctx.audit.log({ action: 'export.created', resourceType: 'data_export', resourceId: exportRecord.id });

			await ctx.notifications.notifyAdmins(orgId, userId, {
				type: 'bulk_data_exported',
				title: 'Data Exported',
				message: `"${input.email ?? 'A user'}" exported organization data.`
			});

			return { _json: jsonStr, _orgId: orgId };
		} catch (err) {
			await ctx.rawStore.update('data_exports', orgId, exportRecord.id, {
				status: 'failed',
				completed_at: new Date().toISOString()
			});
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
				'Content-Disposition': `attachment; filename="org-export-${result._orgId}-${new Date().toISOString().split('T')[0]}.json"`
			}
		});
	}
});

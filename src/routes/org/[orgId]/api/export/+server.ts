import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { getApiContext, getAdminClient } from '$lib/server/supabase';
import { isBillingEnabled } from '$lib/config/billing';
import { getEffectiveTier, getMonthlyExportCount } from '$lib/server/subscription';
import { TIER_CONFIG } from '$lib/types/subscription';
import { notifyAdmins } from '$lib/server/notifications';
import { queryPersonnel } from '$lib/server/personnelRepository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export const POST = handle<Record<string, unknown>, Record<string, unknown>>({
	permission: 'manageMembers',
	mutation: true,
	parseInput: (event: RequestEvent) => {
		const { supabase, userId, isSandbox } = getApiContext(event.locals, event.cookies, event.params.orgId as string);
		return { _supabase: supabase, _userId: userId, _isSandbox: isSandbox, _email: event.locals.user?.email };
	},
	fn: async (ctx, input) => {
		const supabase = input._supabase as SupabaseClient;
		const userId = input._userId as string;
		const orgId = ctx.auth.orgId;

		if (input._isSandbox) fail(403, 'Not available in sandbox');

		if (isBillingEnabled) {
			const tier = await getEffectiveTier(supabase, orgId);
			const config = TIER_CONFIG[tier.tier];
			const exportCount = await getMonthlyExportCount(supabase, orgId);
			if (exportCount >= config.bulkExportsPerMonth) {
				return {
					_rateLimited: true,
					error: `Export limit reached (${config.bulkExportsPerMonth}/month). Upgrade for unlimited exports.`
				};
			}
		}

		const { data: exportRecord, error: insertError } = await supabase
			.from('data_exports')
			.insert({ org_id: orgId, requested_by: userId, status: 'processing' })
			.select()
			.single();

		if (insertError) fail(500, `Failed to create export record: ${insertError.message}`);

		try {
			const [
				personnelRes,
				groupsRes,
				availabilityRes,
				trainingTypesRes,
				personnelTrainingsRes,
				statusTypesRes,
				assignmentTypesRes,
				dailyAssignmentsRes,
				counselingTypesRes,
				counselingRecordsRes,
				specialDaysRes,
				onboardingTemplateRes,
				onboardingsRes,
				ratingSchemeRes,
				developmentGoalsRes,
				personnelExtendedRes,
				dutyRosterHistoryRes
			] = await Promise.all([
				queryPersonnel<Record<string, unknown>>({ supabase, orgId, select: '*', transform: 'raw' }).then((r) => ({
					data: r.data,
					error: r.error ? { message: r.error } : null
				})),
				supabase.from('groups').select('*').eq('organization_id', orgId),
				supabase.from('availability_entries').select('*').eq('organization_id', orgId),
				supabase.from('training_types').select('*').eq('organization_id', orgId),
				supabase.from('personnel_trainings').select('*').eq('organization_id', orgId),
				supabase.from('status_types').select('*').eq('organization_id', orgId),
				supabase.from('assignment_types').select('*').eq('organization_id', orgId),
				supabase.from('daily_assignments').select('*').eq('organization_id', orgId),
				supabase.from('counseling_types').select('*').eq('organization_id', orgId),
				supabase.from('counseling_records').select('*').eq('organization_id', orgId),
				supabase.from('special_days').select('*').eq('organization_id', orgId),
				supabase.from('onboarding_template_steps').select('*').eq('organization_id', orgId),
				supabase.from('personnel_onboardings').select('*').eq('organization_id', orgId),
				supabase.from('rating_scheme_entries').select('*').eq('organization_id', orgId),
				supabase.from('development_goals').select('*').eq('organization_id', orgId),
				supabase.from('personnel_extended_info').select('*').eq('organization_id', orgId),
				supabase.from('duty_roster_history').select('*').eq('organization_id', orgId)
			]);

			const onboardingIds = (onboardingsRes.data ?? []).map((o: { id: string }) => o.id);
			const onboardingProgressRes =
				onboardingIds.length > 0
					? await supabase.from('onboarding_step_progress').select('*').in('onboarding_id', onboardingIds)
					: { data: [] };

			const exportData = {
				exportedAt: new Date().toISOString(),
				organizationId: orgId,
				personnel: personnelRes.data ?? [],
				groups: groupsRes.data ?? [],
				availabilityEntries: availabilityRes.data ?? [],
				trainingTypes: trainingTypesRes.data ?? [],
				personnelTrainings: personnelTrainingsRes.data ?? [],
				statusTypes: statusTypesRes.data ?? [],
				assignmentTypes: assignmentTypesRes.data ?? [],
				dailyAssignments: dailyAssignmentsRes.data ?? [],
				counselingTypes: counselingTypesRes.data ?? [],
				counselingRecords: counselingRecordsRes.data ?? [],
				specialDays: specialDaysRes.data ?? [],
				onboardingTemplateSteps: onboardingTemplateRes.data ?? [],
				personnelOnboardings: onboardingsRes.data ?? [],
				onboardingStepProgress: onboardingProgressRes.data ?? [],
				ratingSchemeEntries: ratingSchemeRes.data ?? [],
				developmentGoals: developmentGoalsRes.data ?? [],
				personnelExtendedInfo: personnelExtendedRes.data ?? [],
				dutyRosterHistory: dutyRosterHistoryRes.data ?? []
			};

			const jsonStr = JSON.stringify(exportData, null, 2);

			const adminClient = getAdminClient();
			await adminClient
				.from('data_exports')
				.update({
					status: 'completed',
					completed_at: new Date().toISOString(),
					file_size_bytes: new TextEncoder().encode(jsonStr).length
				})
				.eq('id', exportRecord.id);

			ctx.audit.log({ action: 'export.created', resourceType: 'data_export', resourceId: exportRecord.id });

			await notifyAdmins(orgId, userId, {
				type: 'bulk_data_exported',
				title: 'Data Exported',
				message: `"${input._email ?? 'A user'}" exported organization data.`
			});

			return { _json: jsonStr, _orgId: orgId };
		} catch (err) {
			const adminClient = getAdminClient();
			await adminClient
				.from('data_exports')
				.update({
					status: 'failed',
					completed_at: new Date().toISOString()
				})
				.eq('id', exportRecord.id);
			throw err;
		}
	},
	formatOutput: (result) => {
		if ('_rateLimited' in result) {
			const { error: errMsg } = result as Record<string, unknown>;
			return new Response(JSON.stringify({ error: errMsg }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		const r = result as Record<string, unknown>;
		return new Response(r._json as string, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="org-export-${r._orgId}-${new Date().toISOString().split('T')[0]}.json"`
			}
		});
	}
});

import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { isBillingEnabled } from '$lib/config/billing';
import { getEffectiveTier, getMonthlyExportCount } from '$lib/server/subscription';
import { TIER_CONFIG } from '$lib/types/subscription';
import { getAdminClient } from '$lib/server/supabase';
import { auditLog } from '$lib/server/auditLog';
import { notifyAdmins } from '$lib/server/notifications';

export const POST = apiRoute(
	{ permission: { manageMembers: true }, readOnly: false },
	async ({ supabase, orgId, userId }, event) => {
	// Check rate limit when billing is enabled
	if (isBillingEnabled) {
		const tier = await getEffectiveTier(supabase, orgId);
		const config = TIER_CONFIG[tier.tier];
		const exportCount = await getMonthlyExportCount(supabase, orgId);
		if (exportCount >= config.bulkExportsPerMonth) {
			return json(
				{
					error: `Export limit reached (${config.bulkExportsPerMonth}/month). Upgrade for unlimited exports.`
				},
				{ status: 429 }
			);
		}
	}

	// Record export as processing
	const { data: exportRecord, error: insertError } = await supabase
		.from('data_exports')
		.insert({
			org_id: orgId,
			requested_by: userId,
			status: 'processing'
		})
		.select()
		.single();

	if (insertError) throw error(500, `Failed to create export record: ${insertError.message}`);

	try {
		// Query all org data in parallel
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
			supabase.from('personnel').select('*').eq('organization_id', orgId).is('archived_at', null),
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

		// Fetch onboarding step progress (depends on onboarding IDs)
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

		// Update export record to completed using admin client (no UPDATE RLS policy on data_exports)
		const adminClient = getAdminClient();
		await adminClient
			.from('data_exports')
			.update({
				status: 'completed',
				completed_at: new Date().toISOString(),
				file_size_bytes: new TextEncoder().encode(jsonStr).length
			})
			.eq('id', exportRecord.id);

		auditLog({ action: 'export.created', resourceType: 'data_export', orgId }, { userId });

		await notifyAdmins(orgId, userId, {
			type: 'bulk_data_exported',
			title: 'Data Exported',
			message: `"${event.locals.user?.email ?? 'A user'}" exported organization data.`
		});

		// Return as downloadable JSON
		return new Response(jsonStr, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="org-export-${orgId}-${new Date().toISOString().split('T')[0]}.json"`
			}
		});
	} catch (err) {
		// Mark export as failed
		const adminClient = getAdminClient();
		await adminClient
			.from('data_exports')
			.update({
				status: 'failed',
				completed_at: new Date().toISOString()
			})
			.eq('id', exportRecord.id);

		throw error(500, 'Failed to generate export');
	}
});

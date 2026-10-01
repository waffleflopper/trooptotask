import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import type { OnboardingReconciliationPort, OnboardingReconciliationResult } from '../contracts';

/** Uses the ordinary authenticated client; SQL retains policy and atomic packet reconciliation. */
export function createSupabaseOnboardingReconciliationPort(supabase: SupabaseClient): OnboardingReconciliationPort {
	return {
		async reconcile(organizationId, onboardingId, newTemplateId) {
			const { data, error } = await supabase.rpc('reconcile_onboarding_packet', {
				p_organization_id: organizationId,
				p_onboarding_id: onboardingId,
				p_new_template_id: newTemplateId
			});
			if (error) {
				if (error.code === '42501') fail(403, error.message);
				if (error.code === 'P0002') fail(404, error.message);
				if (error.code === 'P0001') fail(400, error.message);
				throw new Error(error.message);
			}
			if (!data) throw new Error('Onboarding reconciliation returned no packet');
			return data as OnboardingReconciliationResult;
		}
	};
}

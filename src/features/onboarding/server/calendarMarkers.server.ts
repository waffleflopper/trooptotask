import type { SupabaseClient } from '@supabase/supabase-js';
import type { OnboardingCalendarMarkersPort } from '../contracts';

export function createSupabaseOnboardingCalendarMarkersPort(supabase: SupabaseClient): OnboardingCalendarMarkersPort {
	return {
		async listActivePersonnelIds(orgId) {
			const { data, error } = await supabase.rpc('active_onboarding_calendar_personnel_ids', {
				p_organization_id: orgId
			});
			if (error) throw new Error(error.message);
			return (data ?? []).map((row: { personnel_id: string }) => row.personnel_id);
		}
	};
}

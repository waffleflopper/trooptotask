import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import type { OnboardingInactiveStepRemovalPort } from '../contracts';

/** The ordinary authenticated DELETE requires the step to remain inactive at persistence. */
export function createSupabaseOnboardingInactiveStepRemovalPort(
	supabase: SupabaseClient
): OnboardingInactiveStepRemovalPort {
	return {
		async remove(organizationId, stepId) {
			const { data, error } = await supabase
				.from('onboarding_step_progress')
				.delete()
				.eq('organization_id', organizationId)
				.eq('id', stepId)
				.eq('active', false)
				.select('id')
				.maybeSingle();
			if (error) {
				if (error.code === '42501') fail(403, error.message);
				throw new Error(error.message);
			}
			return data as { id: string } | null;
		}
	};
}

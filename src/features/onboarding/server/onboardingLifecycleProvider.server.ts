import type { SupabaseClient } from '$lib/server/database';
import { fail } from '$lib/errors';
import type { OnboardingLifecycleTransitionPort, OnboardingLifecycleTransitionResult } from '../contracts';

/** One ordinary authenticated parent UPDATE requires the transition's current status. */
export function createSupabaseOnboardingLifecycleTransitionPort(
	supabase: SupabaseClient
): OnboardingLifecycleTransitionPort {
	return {
		async transition(organizationId, onboardingId, command) {
			const expectedStatus = command.kind === 'reopen' ? 'cancelled' : 'in_progress';
			const patch = {
				status: command.kind === 'cancel' ? 'cancelled' : command.kind === 'complete' ? 'completed' : 'in_progress',
				cancelled_at: command.kind === 'cancel' ? command.at : null,
				completed_at: command.kind === 'complete' ? command.at : null
			};
			const { data, error } = await supabase
				.from('personnel_onboardings')
				.update(patch)
				.eq('organization_id', organizationId)
				.eq('id', onboardingId)
				.eq('status', expectedStatus)
				.select('id,status,cancelled_at,completed_at')
				.maybeSingle();
			if (error) {
				if (error.code === '42501') fail(403, error.message);
				if (error.code === '22023') fail(400, error.message);
				throw new Error(error.message);
			}
			return data as OnboardingLifecycleTransitionResult | null;
		}
	};
}

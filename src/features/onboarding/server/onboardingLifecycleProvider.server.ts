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
			let query = supabase
				.from('personnel_onboardings')
				.update(patch)
				.eq('organization_id', organizationId)
				.eq('id', onboardingId)
				.eq('status', expectedStatus);
			if (command.kind === 'complete') {
				query = query.eq('incomplete.active', true).eq('incomplete.completed', false);
			}
			const { data, error } = await query
				.select(
					command.kind === 'complete'
						? 'id,status,cancelled_at,completed_at,incomplete:onboarding_step_progress(id)'
						: 'id,status,cancelled_at,completed_at'
				)
				.maybeSingle();
			if (error) {
				if (error.code === '42501') fail(403, error.message);
				if (error.code === '22023') fail(400, error.message);
				if (error.code === '55000') fail(409, error.message);
				if (error.code === '23505' && error.message.includes('"personnel_onboardings_active_idx"')) {
					fail(409, 'This person already has an active onboarding');
				}
				throw new Error(error.message);
			}
			return data as OnboardingLifecycleTransitionResult | null;
		}
	};
}

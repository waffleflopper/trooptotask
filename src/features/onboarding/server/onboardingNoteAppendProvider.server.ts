import type { SupabaseClient } from '$lib/server/database';
import { fail } from '$lib/errors';
import type { OnboardingNoteAppendPort, OnboardingNoteAppendResult } from '../contracts';

/** The ordinary authenticated database request appends without replacing another writer's notes. */
export function createSupabaseOnboardingNoteAppendPort(supabase: SupabaseClient): OnboardingNoteAppendPort {
	return {
		async append(organizationId, stepId, text) {
			const { data, error } = await supabase.rpc('append_onboarding_step_note', {
				p_organization_id: organizationId,
				p_step_id: stepId,
				p_text: text
			});
			if (error) {
				if (error.code === '42501') fail(403, error.message);
				if (error.code === 'P0002') fail(404, error.message);
				throw new Error(error.message);
			}
			if (!data) throw new Error('Onboarding note append returned no saved notes');
			return data as OnboardingNoteAppendResult;
		}
	};
}

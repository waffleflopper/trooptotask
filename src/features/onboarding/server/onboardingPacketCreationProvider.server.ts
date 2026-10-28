import { packetCreationResult } from './onboardingCommandResults.server';
import type { SupabaseClient } from '$lib/server/database';
import { fail } from '$lib/errors';
import type { OnboardingPacketCreationPort } from '../contracts';

/** The ordinary request client saves the prepared packet in one database transaction. */
export function createSupabaseOnboardingPacketCreationPort(supabase: SupabaseClient): OnboardingPacketCreationPort {
	return {
		async create(organizationId, input) {
			const { data, error } = await supabase.rpc('start_onboarding_packet', {
				p_organization_id: organizationId,
				p_personnel_id: input.personnelId,
				p_template_id: input.templateId,
				p_started_at: input.startedAt,
				p_steps: input.steps.map((step) => ({
					template_step_id: step.template_step_id,
					step_name: step.step_name,
					step_type: step.step_type,
					training_type_id: step.training_type_id,
					stages: step.stages,
					sort_order: step.sort_order,
					completed: step.completed
				}))
			});
			if (error) {
				if (error.code === '42501') fail(403, error.message);
				if (error.code === 'P0002') fail(404, error.message);
				if (error.code === '23505' && error.message.includes('"personnel_onboardings_active_idx"')) {
					fail(409, 'Soldier already has an active onboarding');
				}
				throw new Error(error.message);
			}

			return packetCreationResult.parse(data);
		}
	};
}

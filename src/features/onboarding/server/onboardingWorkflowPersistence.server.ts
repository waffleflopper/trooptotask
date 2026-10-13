import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { OnboardingWorkflowPersistence } from '../contracts';
import { PACKET_FIELDS, toPacket, type PacketRow, type ProgressRow } from './onboardingPersistenceMapping.server';

export function createSupabaseOnboardingWorkflowPersistence(
	client: SupabaseClient,
	orgId: string
): OnboardingWorkflowPersistence {
	return {
		async listPackets(mode) {
			const result = await selectAllSupabaseRows<PacketRow>(async (from, to) => {
				let query = client.from('personnel_onboardings').select(PACKET_FIELDS).eq('organization_id', orgId);
				if (mode === 'active') query = query.eq('status', 'in_progress');
				if (mode === 'history') query = query.in('status', ['completed', 'cancelled']);
				const { data, error } = await query.order('id', { ascending: true }).range(from, to).returns<PacketRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toPacket);
		},
		async listSavedActivePackets() {
			const result = await selectAllSupabaseRows<PacketRow>(async (from, to) => {
				let query = client.from('personnel_onboardings').select(PACKET_FIELDS).eq('organization_id', orgId);
				query = query.eq('status', 'in_progress');
				const { data, error } = await query.order('id', { ascending: true }).range(from, to).returns<PacketRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toPacket);
		},
		async findPacketReference(id) {
			const { data, error } = await client
				.from('personnel_onboardings')
				.select('id, personnel_id, status, template_id')
				.eq('organization_id', orgId)
				.eq('id', id)
				.single<Pick<PacketRow, 'id' | 'personnel_id' | 'status' | 'template_id'>>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data
				? { id: data.id, personnelId: data.personnel_id, status: data.status, templateId: data.template_id ?? null }
				: null;
		},
		async findStepReference(id) {
			const { data, error } = await client
				.from('onboarding_step_progress')
				.select('id, onboarding_id, step_name, step_type, stages, completed, current_stage, active')
				.eq('organization_id', orgId)
				.eq('id', id)
				.single<
					Pick<
						ProgressRow,
						'id' | 'onboarding_id' | 'step_name' | 'step_type' | 'stages' | 'completed' | 'current_stage' | 'active'
					>
				>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data
				? {
						id: data.id,
						onboardingId: data.onboarding_id,
						stepName: data.step_name,
						stepType: data.step_type,
						stages: data.stages ?? null,
						completed: data.completed,
						currentStage: data.current_stage ?? null,
						active: data.active ?? true
					}
				: null;
		},
		async listActivePacketIdsForPersonnel(personnelId) {
			const result = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_onboardings')
					.select('id')
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.eq('status', 'in_progress')
					.order('id', { ascending: true })
					.range(from, to)
					.returns<{ id: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => row.id);
		},
		async listIncompleteActiveStepIds(onboardingId) {
			const result = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('onboarding_step_progress')
					.select('id')
					.eq('organization_id', orgId)
					.eq('onboarding_id', onboardingId)
					.eq('active', true)
					.eq('completed', false)
					.order('id', { ascending: true })
					.range(from, to)
					.returns<{ id: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => row.id);
		},
		async listPacketIdsUsingTemplate(templateId) {
			const result = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_onboardings')
					.select('id')
					.eq('organization_id', orgId)
					.eq('template_id', templateId)
					.order('id', { ascending: true })
					.range(from, to)
					.returns<{ id: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => row.id);
		},
		async saveCheckboxCompletion(stepId, completed) {
			const { data, error } = await client
				.from('onboarding_step_progress')
				.update({ completed })
				.eq('organization_id', orgId)
				.eq('id', stepId)
				.select('id, onboarding_id, step_name, step_type, completed, current_stage')
				.single<
					Pick<ProgressRow, 'id' | 'onboarding_id' | 'step_name' | 'step_type' | 'completed' | 'current_stage'>
				>();
			if (error) throw new Error(error.message);
			return {
				id: data.id,
				onboardingId: data.onboarding_id,
				stepName: data.step_name,
				stepType: data.step_type,
				completed: data.completed,
				currentStage: data.current_stage ?? null
			};
		},
		async savePaperworkProgress(stepId, currentStage, completed) {
			const { data, error } = await client
				.from('onboarding_step_progress')
				.update({ current_stage: currentStage, completed })
				.eq('organization_id', orgId)
				.eq('id', stepId)
				.select('id, onboarding_id, step_name, step_type, completed, current_stage')
				.single<
					Pick<ProgressRow, 'id' | 'onboarding_id' | 'step_name' | 'step_type' | 'completed' | 'current_stage'>
				>();
			if (error) throw new Error(error.message);
			return {
				id: data.id,
				onboardingId: data.onboarding_id,
				stepName: data.step_name,
				stepType: data.step_type,
				completed: data.completed,
				currentStage: data.current_stage ?? null
			};
		},
		async countActivePacketsByTemplate(templateIds) {
			const counts = await Promise.all(
				templateIds.map(async (templateId) => {
					const { count, error } = await client
						.from('personnel_onboardings')
						.select('id', { count: 'exact', head: true })
						.eq('organization_id', orgId)
						.eq('template_id', templateId)
						.eq('status', 'in_progress');
					if (error) throw new Error(error.message);
					return [templateId, count ?? 0] as const;
				})
			);
			return Object.fromEntries(counts);
		},
		async clearPacketTemplate(id) {
			const { error } = await client
				.from('personnel_onboardings')
				.update({ template_id: null })
				.eq('organization_id', orgId)
				.eq('id', id);
			if (error) throw new Error(error.message);
		}
	};
}

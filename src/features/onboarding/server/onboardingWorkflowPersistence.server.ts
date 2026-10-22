import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { OnboardingWorkflowPersistence } from '../contracts';
import { PACKET_FIELDS, toPacket, type PacketRow, type ProgressRow } from './onboardingPersistenceMapping.server';

type CompletionRow = { id: string; started_at: string; completed_at: string };
type SavedProgressRow = Pick<
	ProgressRow,
	'id' | 'onboarding_id' | 'step_name' | 'step_type' | 'completed' | 'current_stage' | 'progress_changed_at'
>;

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
		async listCompletionsSince(since) {
			const result = await selectAllSupabaseRows<CompletionRow>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_onboardings')
					.select('id, started_at, completed_at')
					.eq('organization_id', orgId)
					.eq('status', 'completed')
					.gte('completed_at', since)
					.order('id', { ascending: true })
					.range(from, to)
					.returns<CompletionRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => ({ startedAt: row.started_at, completedAt: row.completed_at }));
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
		async listActivePacketPersonnelIds() {
			const result = await selectAllSupabaseRows<{ id: string; personnel_id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_onboardings')
					.select('id, personnel_id')
					.eq('organization_id', orgId)
					.eq('status', 'in_progress')
					.order('id', { ascending: true })
					.range(from, to)
					.returns<{ id: string; personnel_id: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return [...new Set((result.data ?? []).map((row) => row.personnel_id))];
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
		async findLatestPacketForPersonnel(personnelId) {
			const { data, error } = await client
				.from('personnel_onboardings')
				.select(PACKET_FIELDS)
				.eq('organization_id', orgId)
				.eq('personnel_id', personnelId)
				.in('status', ['in_progress', 'completed'])
				.order('started_at', { ascending: false })
				.order('id', { ascending: false })
				.limit(1)
				.maybeSingle<PacketRow>();
			if (error) throw new Error(error.message);
			return data ? toPacket(data) : null;
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
		async saveCheckboxCompletion(stepId, completed) {
			const { data, error } = await client
				.from('onboarding_step_progress')
				.update({ completed })
				.eq('organization_id', orgId)
				.eq('id', stepId)
				.select('id, onboarding_id, step_name, step_type, completed, current_stage, progress_changed_at')
				.single<SavedProgressRow>();
			if (error) throw new Error(error.message);
			return {
				id: data.id,
				onboardingId: data.onboarding_id,
				stepName: data.step_name,
				stepType: data.step_type,
				completed: data.completed,
				currentStage: data.current_stage ?? null,
				progressChangedAt: data.progress_changed_at
			};
		},
		async savePaperworkProgress(stepId, currentStage, completed) {
			const { data, error } = await client
				.from('onboarding_step_progress')
				.update({ current_stage: currentStage, completed })
				.eq('organization_id', orgId)
				.eq('id', stepId)
				.select('id, onboarding_id, step_name, step_type, completed, current_stage, progress_changed_at')
				.single<SavedProgressRow>();
			if (error) throw new Error(error.message);
			return {
				id: data.id,
				onboardingId: data.onboarding_id,
				stepName: data.step_name,
				stepType: data.step_type,
				completed: data.completed,
				currentStage: data.current_stage ?? null,
				progressChangedAt: data.progress_changed_at
			};
		},
		async countActivePacketsByTemplate() {
			type TemplateCountRow = { id: string; personnel_onboardings: Array<{ count: number }> };
			const result = await selectAllSupabaseRows<TemplateCountRow>(async (from, to) => {
				const { data, error } = await client
					.from('onboarding_templates')
					.select('id, personnel_onboardings(count)')
					.eq('organization_id', orgId)
					.eq('personnel_onboardings.organization_id', orgId)
					.eq('personnel_onboardings.status', 'in_progress')
					.order('id', { ascending: true })
					.range(from, to)
					.returns<TemplateCountRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return Object.fromEntries((result.data ?? []).map((row) => [row.id, row.personnel_onboardings[0]?.count ?? 0]));
		}
	};
}

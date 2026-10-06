import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationSettingsReader, OrganizationPolicyWritePort } from './settingsTypes';

/** The ordinary request client keeps these reads and writes under Organization RLS. */
export function createSupabaseOrganizationSettingsReader(supabase: SupabaseClient): OrganizationSettingsReader {
	async function findScalar(orgId: string, column: string): Promise<number | null | undefined> {
		const { data, error } = await supabase
			.from('organizations')
			.select(column)
			.eq('id', orgId.toLowerCase())
			.maybeSingle();
		if (error) throw new Error(error.message);
		return (data as Record<string, number | null> | null)?.[column];
	}
	return {
		async findPolicies(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select('archive_retention_months, loss_warning_window_days, training_readiness_goal_percent')
				.eq('id', orgId.toLowerCase())
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data
				? {
						archiveRetentionMonths: data.archive_retention_months,
						lossWarningWindowDays: data.loss_warning_window_days,
						trainingReadinessGoalPercent: data.training_readiness_goal_percent
					}
				: null;
		},
		async findTrainingBriefingContext(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select('name, training_readiness_goal_percent')
				.eq('id', orgId.toLowerCase())
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? { name: data.name, trainingReadinessGoalPercent: data.training_readiness_goal_percent } : null;
		},
		findArchiveRetentionMonths: (orgId) => findScalar(orgId, 'archive_retention_months'),
		findLossWarningWindowDays: (orgId) => findScalar(orgId, 'loss_warning_window_days'),
		findStorageCapBytes: (orgId) => findScalar(orgId, 'personnel_document_storage_cap_bytes'),
		async countPendingInvitations(orgId) {
			const { count, error } = await supabase
				.from('organization_invitations')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId.toLowerCase())
				.eq('status', 'pending');
			if (error) throw new Error(error.message);
			return count ?? 0;
		}
	};
}

export function createSupabaseOrganizationPolicyWritePort(supabase: SupabaseClient): OrganizationPolicyWritePort {
	return {
		async updatePolicies(orgId, changes) {
			const updates: Record<string, number> = {};
			if (changes.archiveRetentionMonths !== undefined)
				updates.archive_retention_months = changes.archiveRetentionMonths;
			if (changes.lossWarningWindowDays !== undefined) updates.loss_warning_window_days = changes.lossWarningWindowDays;
			if (changes.trainingReadinessGoalPercent !== undefined)
				updates.training_readiness_goal_percent = changes.trainingReadinessGoalPercent;
			if (changes.personnelDocumentStorageCapBytes !== undefined)
				updates.personnel_document_storage_cap_bytes = changes.personnelDocumentStorageCapBytes;
			const { data, error } = await supabase
				.from('organizations')
				.update(updates)
				.eq('id', orgId)
				.select(['id', ...Object.keys(updates)].join(', '))
				.single<{ id: string; [field: string]: string | number | null }>();
			if (error) return error.message || 'Organization settings update failed';
			return data?.id === orgId && Object.entries(updates).every(([field, value]) => data[field] === value)
				? null
				: 'Unable to confirm Organization settings update';
		}
	};
}

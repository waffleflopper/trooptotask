import type { SupabaseClient } from '$lib/server/database';
import type { CriticalTasksSettingsWritePort } from '../contracts';

export function createSupabaseCriticalTasksSettingsWritePort(supabase: SupabaseClient): CriticalTasksSettingsWritePort {
	return {
		async saveDefaults(orgId, defaults) {
			const { error } = await supabase.rpc('set_critical_tasks_defaults', {
				p_organization_id: orgId,
				p_default_expiration_months: defaults.defaultExpirationMonths,
				p_expiring_soon_warning_days: defaults.expiringSoonWarningDays
			});
			if (error) throw error;
		}
	};
}

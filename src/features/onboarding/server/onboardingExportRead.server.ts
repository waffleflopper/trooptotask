import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

const EXPORT_TABLES = [
	'onboarding_templates',
	'onboarding_template_steps',
	'personnel_onboardings',
	'onboarding_step_progress'
] as const;

export type OnboardingExportTable = (typeof EXPORT_TABLES)[number];

export interface OnboardingExportReader {
	listRows(table: OnboardingExportTable): Promise<Record<string, unknown>[]>;
}

export function createSupabaseOnboardingExportReader(client: SupabaseClient, orgId: string): OnboardingExportReader {
	return {
		async listRows(table) {
			if (!EXPORT_TABLES.includes(table)) {
				throw Object.assign(new Error('Unsupported Onboarding export table'), { status: 400 });
			}
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client.from(table).select('*').eq('organization_id', orgId).range(from, to);
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Onboarding export read failed');
			return result.data ?? [];
		}
	};
}

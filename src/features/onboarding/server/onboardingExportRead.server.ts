import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { RequestFailure } from '$lib/errors';

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
				throw new RequestFailure(400, 'Unsupported Onboarding export table');
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

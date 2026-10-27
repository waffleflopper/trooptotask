import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { isOrganizationRawExportTable, type OrganizationRawExportReader } from './rawExportTypes';
import { RequestFailure } from '$lib/errors';

const PROFILE_EXPORT_FIELDS =
	'id,name,created_by,created_at,url_slug,archive_retention_months,suspended_at,critical_tasks_default_expiration_months,critical_tasks_expiring_soon_warning_days,loss_warning_window_days,personnel_document_storage_cap_bytes,training_readiness_goal_percent';

/** Construction is lazy. Invitation provenance keeps its existing platform-admin RLS restriction. */
export function createSupabaseOrganizationRawExportReader(client: SupabaseClient): OrganizationRawExportReader {
	return {
		async listRows(orgId, table) {
			if (!isOrganizationRawExportTable(table)) {
				throw new RequestFailure(400, 'Unsupported Organization export table');
			}
			if (table === 'organization_setup') {
				const { data, error } = await client.rpc('export_organization_setup', { p_organization_id: orgId });
				if (error) throw new Error(error.message);
				return data ?? [];
			}
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client
					.from(table)
					.select(table === 'organizations' ? PROFILE_EXPORT_FIELDS : '*')
					.eq(table === 'organizations' ? 'id' : 'organization_id', orgId)
					.order('id', { ascending: true })
					.range(from, to);
				return { data: data as Record<string, unknown>[] | null, error };
			});
			if (result.error) {
				throw new Error((result.error as { message?: string }).message ?? 'Organization export read failed');
			}
			return result.data ?? [];
		}
	};
}

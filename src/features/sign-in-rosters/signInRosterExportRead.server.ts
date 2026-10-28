import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

/** Complete saved archive fields visible to the ordinary exporting request's RLS. */
export interface SignInRosterExportReader {
	listRows(): Promise<Record<string, unknown>[]>;
}

export function createSupabaseSignInRosterExportReader(
	client: SupabaseClient,
	orgId: string
): SignInRosterExportReader {
	return {
		async listRows() {
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client
					.from('sign_in_rosters')
					.select('*')
					.eq('organization_id', orgId)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Sign-in roster export read failed');
			return result.data ?? [];
		}
	};
}

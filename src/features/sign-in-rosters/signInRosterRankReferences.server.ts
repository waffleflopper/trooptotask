import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

export interface SignInRosterRankReference {
	filterRanks: string[];
	snapshotRanks: string[];
}

export type ReadSignInRosterRankReferences = () => Promise<SignInRosterRankReference[]>;

interface SavedRankReferenceRow {
	filter_config: unknown;
	personnel_snapshot: unknown;
}

function filterRanks(value: unknown): string[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
	const ranks = (value as { ranks?: unknown }).ranks;
	return Array.isArray(ranks) ? ranks.filter((rank): rank is string => typeof rank === 'string') : [];
}

function snapshotRanks(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry: unknown) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
		const rank = (entry as { rank?: unknown }).rank;
		return typeof rank === 'string' ? [rank] : [];
	});
}

export function createSupabaseSignInRosterRankReferenceReader(
	client: SupabaseClient,
	orgId: string
): ReadSignInRosterRankReferences {
	return async () => {
		const result = await selectAllSupabaseRows<SavedRankReferenceRow>(async (from, to) => {
			const { data, error } = await client
				.from('sign_in_rosters')
				.select('filter_config,personnel_snapshot')
				.eq('organization_id', orgId)
				.order('id', { ascending: true })
				.range(from, to);
			return { data, error };
		});
		if (result.error)
			throw new Error((result.error as { message?: string }).message ?? 'Sign-in roster rank references unavailable');
		return (result.data ?? []).map((row) => ({
			filterRanks: filterRanks(row.filter_config),
			snapshotRanks: snapshotRanks(row.personnel_snapshot)
		}));
	};
}

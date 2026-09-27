import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelRatingSchemeRosterPort } from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

interface RatingSchemePersonnelLookupRow {
	id: string;
	rank: string | null;
	last_name: string | null;
	first_name: string | null;
}

export function createSupabasePersonnelRatingSchemeRosterPort(
	supabase: SupabaseClient,
	getAdminClient: () => SupabaseClient
): PersonnelRatingSchemeRosterPort {
	return {
		async listActiveReferences(actor) {
			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.ratingScheme.readRosterReferences,
				{ kind: 'unscoped' },
				'personnel'
			);
			const { data, error } = await supabase.rpc('list_rating_scheme_personnel_lookup', {
				p_organization_id: actor.orgId
			});

			if (error) {
				throw new Error(error.message);
			}

			return ((data ?? []) as RatingSchemePersonnelLookupRow[]).map((row) => ({
				id: row.id,
				rank: row.rank ?? '',
				lastName: row.last_name ?? '',
				firstName: row.first_name ?? ''
			}));
		},
		async findRatedPersonGroupForWrite(actor, personnelId) {
			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
				{ kind: 'unscoped' },
				'personnel'
			);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, group_id',
				status: 'all',
				ids: [personnelId]
			});
			return rows[0] ? { groupId: (rows[0].group_id as string | null) ?? null } : null;
		}
	};
}

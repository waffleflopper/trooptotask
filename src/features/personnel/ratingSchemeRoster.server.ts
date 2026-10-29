import type { SupabaseClient } from '$lib/server/database';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelRatingSchemeRosterPort } from './contracts';
import { queryScopedPersonnelRows, toPersonnelWriteSubject } from './scopedRosterQuery.server';

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
		async listArchivedRatedPersonIds(actor) {
			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.ratingScheme.readRosterReferences,
				{ kind: 'unscoped' },
				'personnel'
			);
			// Organization-wide so hiding does not depend on Group scope matching the entry's Person;
			// the inner join bounds the read to rated People rather than the whole archive.
			const rows = await queryScopedPersonnelRows(
				getAdminClient,
				actor.orgId,
				{ kind: 'organization' },
				{
					select: 'id, rating_scheme_entries!rating_scheme_entries_rated_person_id_fkey!inner(id)',
					status: 'archived'
				}
			);
			return rows.map((row) => row.id as string);
		},
		async findRatedPersonForWrite(actor, personnelId) {
			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
				{ kind: 'unscoped' },
				'personnel'
			);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, group_id, rank, last_name',
				status: 'all',
				ids: [personnelId]
			});
			return rows[0] ? toPersonnelWriteSubject(rows[0]) : null;
		},
		async hasEvaluatorReferences(actor, personnelIds) {
			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
				{ kind: 'unscoped' },
				'personnel'
			);
			const ids = [...new Set(personnelIds.map((id) => id.toLowerCase()))];
			if (!ids.length) return true;
			// The rated Person anchors write scope. This existence-only check admits
			// evaluators elsewhere in the same Organization, including archived People.
			const rows = await queryScopedPersonnelRows(
				getAdminClient,
				actor.orgId,
				{ kind: 'organization' },
				{
					select: 'id',
					status: 'all',
					ids
				}
			);
			return rows.length === ids.length;
		}
	};
}

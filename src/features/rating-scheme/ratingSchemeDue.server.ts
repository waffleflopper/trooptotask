import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonnelRatingSchemeRosterPort } from '$features/personnel/contracts';
import { evaluateFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { isArchivedPerson, toArchivedPersonIds } from './archivedPeople';
import type { RatingSchemeDueEntry, RatingSchemeDuePort } from './contracts';

interface RatingSchemeDueRow {
	id: string;
	rated_person_id: string;
	eval_type: RatingSchemeDueEntry['evalType'];
	rating_period_end: string;
	status: RatingSchemeDueEntry['status'];
}

/** The authenticated request client retains Rating Scheme RLS without a Personnel SELECT. */
export function createSupabaseRatingSchemeDuePort(
	supabase: SupabaseClient,
	personnelRoster: Pick<PersonnelRatingSchemeRosterPort, 'listActiveReferences' | 'listArchivedRatedPersonIds'>
): RatingSchemeDuePort {
	return {
		async listDueEntries(actor) {
			const decision = await evaluateFeaturePolicy({ auth: actor }, POLICY_ACTION_CATALOG.ratingScheme.viewEntries, {
				kind: 'unscoped'
			});
			if (!decision.allowed || (actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0)) return [];

			const [{ data, error }, archivedIds, personnel] = await Promise.all([
				selectAllSupabaseRows<RatingSchemeDueRow>(
					async (from, to) =>
						await supabase
							.from('rating_scheme_entries')
							.select('id, rated_person_id, eval_type, rating_period_end, status')
							.eq('organization_id', actor.orgId)
							.order('id', { ascending: true })
							.range(from, to)
				),
				personnelRoster.listArchivedRatedPersonIds(actor),
				personnelRoster.listActiveReferences(actor)
			]);
			if (error) throw new Error((error as { message: string }).message);
			const archived = toArchivedPersonIds(archivedIds);
			const names = new Map(
				personnel.map((person) => [person.id, `${person.rank} ${person.lastName}, ${person.firstName}`])
			);
			return (data ?? [])
				.filter((row) => !isArchivedPerson(archived, row.rated_person_id))
				.map((row) => toDueEntry(row, names.get(row.rated_person_id)));
		}
	};
}

function toDueEntry(row: RatingSchemeDueRow, ratedPersonName: string | undefined): RatingSchemeDueEntry {
	return {
		id: row.id,
		ratedPersonId: row.rated_person_id,
		...(ratedPersonName === undefined ? {} : { ratedPersonName }),
		evalType: row.eval_type,
		ratingPeriodEnd: row.rating_period_end,
		status: row.status
	};
}

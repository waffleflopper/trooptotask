import type { Personnel } from '$features/personnel/contracts';
import type { DataStore } from '$lib/server/core/ports';

interface RatingSchemeReadinessLane {
	label: 'Rating Scheme';
	value: 'Not assigned' | 'Aligned' | 'Senior rater needed' | 'Rater needed';
	detail: string;
	tone: 'bad' | 'info' | 'watch';
}

interface RatingSchemeReadinessInput {
	store: Pick<DataStore, 'findMany'>;
	orgId: string;
	personnelId: string;
	/** Delivery supplies the existing Person/Group check under Rating Scheme view policy. */
	loadAuthorizedPerson: () => Promise<Personnel>;
}

interface ReadinessRow {
	status: string;
	rater_person_id: string | null;
	rater_name: string | null;
	senior_rater_person_id: string | null;
	senior_rater_name: string | null;
}

/** The newest noncompleted evaluation determines whether the rating chain is assigned. */
export async function loadRatingSchemeReadinessLane({
	store,
	orgId,
	personnelId,
	loadAuthorizedPerson
}: RatingSchemeReadinessInput): Promise<RatingSchemeReadinessLane> {
	await loadAuthorizedPerson();
	const rows = await store.findMany<ReadinessRow>(
		'rating_scheme_entries',
		orgId,
		{ rated_person_id: personnelId },
		{
			select: 'status, rater_person_id, rater_name, senior_rater_person_id, senior_rater_name',
			orderBy: [
				{ column: 'rating_period_end', ascending: false },
				{ column: 'id', ascending: false }
			]
		}
	);
	const active = rows.find((entry) => entry.status !== 'completed');
	if (!active) {
		return {
			label: 'Rating Scheme',
			value: 'Not assigned',
			detail: 'No active Rating Scheme entry for this Soldier.',
			tone: 'bad'
		};
	}

	const hasRater = Boolean(active.rater_person_id || active.rater_name?.trim());
	const hasSeniorRater = Boolean(active.senior_rater_person_id || active.senior_rater_name?.trim());
	if (hasRater && hasSeniorRater) {
		return {
			label: 'Rating Scheme',
			value: 'Aligned',
			detail: 'Rater and senior rater assigned.',
			tone: 'info'
		};
	}

	return {
		label: 'Rating Scheme',
		value: hasRater ? 'Senior rater needed' : 'Rater needed',
		detail: `${hasRater ? 'Rater assigned' : 'Rater missing'}. ${hasSeniorRater ? 'Senior rater assigned' : 'Senior rater missing'}.`,
		tone: 'watch'
	};
}

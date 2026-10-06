import type { Personnel } from '$features/personnel/contracts';
import type { RatingSchemePersistence } from '../contracts';

interface RatingSchemeReadinessLane {
	label: 'Rating Scheme';
	value: 'Not assigned' | 'Aligned' | 'Senior rater needed' | 'Rater needed';
	detail: string;
	tone: 'bad' | 'info' | 'watch';
}

interface RatingSchemeReadinessInput {
	ratingScheme: Pick<RatingSchemePersistence, 'listPersonReadiness'>;
	personnelId: string;
	/** Delivery supplies the existing Person/Group check under Rating Scheme view policy. */
	loadAuthorizedPerson: () => Promise<Personnel>;
}

/** The newest noncompleted evaluation determines whether the rating chain is assigned. */
export async function loadRatingSchemeReadinessLane({
	ratingScheme,
	personnelId,
	loadAuthorizedPerson
}: RatingSchemeReadinessInput): Promise<RatingSchemeReadinessLane> {
	await loadAuthorizedPerson();
	const rows = await ratingScheme.listPersonReadiness(personnelId);
	const active = rows.find((entry) => entry.status !== 'completed');
	if (!active) {
		return {
			label: 'Rating Scheme',
			value: 'Not assigned',
			detail: 'No active Rating Scheme entry for this Soldier.',
			tone: 'bad'
		};
	}

	const hasRater = Boolean(active.raterPersonId || active.raterName?.trim());
	const hasSeniorRater = Boolean(active.seniorRaterPersonId || active.seniorRaterName?.trim());
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

import type { Evaluation, RatingScheme, RatingSchemeEntry } from './rating-scheme.types';
import { evaluationStore, ratingSchemeStore } from './stores/ratingScheme.svelte';
import { evaluatorChain } from './utils/ratingSchemeEntries';

export { evaluationStore, ratingSchemeEntries, ratingSchemeStore } from './stores/ratingScheme.svelte';

/** One Evaluations page row; its scheme id defaults to `scheme-<id>` so each row has its own scheme. */
export function ratingSchemeEntryFixture(overrides: Partial<RatingSchemeEntry> = {}): RatingSchemeEntry {
	const id = overrides.id ?? 'evaluation-1';
	return {
		id,
		ratingSchemeId: `scheme-${id}`,
		ratedPersonId: 'p1',
		evalType: 'NCOER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2025-04-01',
		ratingPeriodEnd: '2026-03-31',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'drafting',
		archivedAt: null,
		chainSigned: false,
		...overrides
	};
}

/** The scheme and Evaluation a page row was joined from; rows naming one scheme share it. */
export function splitRatingSchemeEntries(entries: readonly RatingSchemeEntry[]): {
	ratingSchemes: RatingScheme[];
	evaluations: Evaluation[];
} {
	const firsts = entries.filter(
		(entry, index) => entries.findIndex((other) => other.ratingSchemeId === entry.ratingSchemeId) === index
	);
	return {
		ratingSchemes: firsts.map(
			(entry): RatingScheme => ({
				id: entry.ratingSchemeId,
				ratedPersonId: entry.ratedPersonId,
				evalType: entry.evalType,
				...evaluatorChain(entry),
				notes: null,
				archivedAt: entry.archivedAt
			})
		),
		evaluations: entries.map((entry) => ({
			id: entry.id,
			ratingSchemeId: entry.ratingSchemeId,
			ratedPersonId: entry.ratedPersonId,
			evalType: entry.evalType,
			reportType: entry.reportType,
			ratingPeriodStart: entry.ratingPeriodStart,
			ratingPeriodEnd: entry.ratingPeriodEnd,
			workflowStatus: entry.workflowStatus,
			notes: entry.notes,
			signedChain: entry.chainSigned ? evaluatorChain(entry) : null
		}))
	};
}

/** Loads page rows into both Rating Scheme stores, as Evals hydration would. */
export function loadRatingSchemeEntries(entries: readonly RatingSchemeEntry[], orgId: string): void {
	const { ratingSchemes, evaluations } = splitRatingSchemeEntries(entries);
	ratingSchemeStore.load(ratingSchemes, orgId);
	evaluationStore.load(evaluations, orgId);
}

import type { HelpGuide } from '../contracts';

export const trackRatingChain: HelpGuide = {
	id: 'track-rating-chain',
	title: "Set a Soldier's rating chain",
	summary: 'Put a Soldier on the rating scheme with their rater and senior rater for an OER, NCOER or WOER.',
	area: 'evaluations',
	routes: ['evals/rating-scheme'],
	keywords: ['rating scheme', 'rating chain', 'rater', 'senior rater', 'reviewer', 'ncoer', 'oer', 'woer', 'eval'],
	feature: 'evaluations',
	access: { lane: 'ratingScheme', level: 'operate' },
	lead: "The Rating Scheme lists each Soldier's standing chain. Each Soldier has one line. Raters can come from the unit or from outside it.",
	steps: [
		{ text: 'On the **Rating Scheme** tab, press **Add to scheme**.', to: 'evals/rating-scheme' },
		{ text: 'Pick the **Rated Soldier**. The eval type comes from their rank.' },
		{
			text: 'Pick the **Rater** and **Senior rater**. Use **+ Intermediate rater** or **+ Reviewer** when the chain has one.'
		},
		{ text: 'Press **Add to scheme**, then start their evaluation from the **Eval Tracker** tab.', to: 'evals' }
	],
	next: 'track-evaluation',
	note: 'A new intermediate rater, senior rater or reviewer applies to the open evaluation at once. A new rater goes through **Change rater**, which closes the open evaluation as a Change of Rater report.'
};

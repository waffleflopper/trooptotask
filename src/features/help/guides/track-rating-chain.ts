import type { HelpGuide } from '../contracts';

export const trackRatingChain: HelpGuide = {
	id: 'track-rating-chain',
	title: "Track a Soldier's rating chain",
	summary: 'Record the rater and senior rater for an OER, NCOER or WOER and track its status.',
	area: 'evaluations',
	routes: ['evals'],
	keywords: ['rating scheme', 'rating chain', 'rater', 'senior rater', 'ncoer', 'oer', 'woer', 'eval', 'evaluation'],
	feature: 'evaluations',
	access: { lane: 'ratingScheme', level: 'operate' },
	lead: 'Each entry on the Evals page is one evaluation with its rating chain and status. Raters can come from the unit or from outside it.',
	steps: [
		{ text: 'On the Evals page, press **Add Entry**.', to: 'evals' },
		{ text: 'Set the **Rated Soldier**, **Type**, **Report**, **Start** and **Thru**.' },
		{
			text: 'Pick the **Rater** and **Senior rater**. Use **+ Intermediate rater** or **+ Reviewer** when the chain has one.'
		},
		{ text: 'Set the **Status**, then press **Add entry**.' }
	],
	note: 'For a rater outside the unit, type their name and add them as an external rater.'
};

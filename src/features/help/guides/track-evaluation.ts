import type { HelpGuide } from '../contracts';

export const trackEvaluation: HelpGuide = {
	id: 'track-evaluation',
	title: 'Track an evaluation to completion',
	summary: 'Start an evaluation from the rating scheme and move it through each signature until it is completed.',
	area: 'evaluations',
	routes: ['evals'],
	keywords: ['eval tracker', 'workflow', 'step', 'signed', 'hrc', 'thru', 'past thru', 'ncoer', 'oer', 'woer', 'eval'],
	feature: 'evaluations',
	access: { lane: 'ratingScheme', level: 'operate' },
	lead: 'The Eval Tracker lists the evaluations in work, past thru first. Soldiers on the rating scheme with no open evaluation wait under Ready to start.',
	steps: [
		{
			text: 'On the **Eval Tracker** tab, press **Start evaluation**, or **Start** beside a Soldier under Ready to start.',
			to: 'evals'
		},
		{ text: 'Check the **Report**, **Start** and **Thru**. An Annual fills Thru in as 12 months after Start.' },
		{ text: 'Choose **Open, at Drafting**, or **Already completed** to record past history, then confirm.' },
		{
			text: 'Open the evaluation from the list. Press the next step to move it along, or pick any step in the list to jump there.'
		}
	],
	note: 'A completed evaluation keeps the chain that signed it. Reopen it to change its report or period.'
};

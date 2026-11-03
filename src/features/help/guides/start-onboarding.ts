import type { HelpGuide } from '../contracts';

export const startOnboarding: HelpGuide = {
	id: 'start-onboarding',
	title: 'Start onboarding for a new arrival',
	summary: 'Open an onboarding packet for a Soldier from one of your templates.',
	area: 'onboarding',
	routes: ['onboarding'],
	keywords: ['new arrival', 'newcomer', 'inprocessing', 'in-processing', 'packet', 'start', 'reception', 'gaining'],
	feature: 'onboarding',
	access: { lane: 'onboarding', level: 'operate' },
	lead: 'Starting onboarding gives a Soldier their own packet built from a template. You track each step on the Onboarding page until they finish.',
	steps: [
		{ text: 'On the Onboarding page, press **Start onboarding**.', to: 'onboarding' },
		{ text: 'Pick the **Template** and the **Start Date**.' },
		{
			text: 'Search for the Soldier under **Member**, or press **Add Person** to add someone who is not in the unit yet. Add Person shows only if you can add Soldiers.'
		},
		{ text: 'Press **Start Onboarding**.' }
	],
	note: 'The button stays off until a template has at least one step. A Training step the Soldier already has recorded starts checked off.',
	next: 'build-onboarding-template'
};

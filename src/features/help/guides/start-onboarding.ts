import type { HelpGuide } from '../contracts';

export const startOnboarding: HelpGuide = {
	id: 'start-onboarding',
	title: 'Start onboarding for a new arrival',
	summary: 'Open onboarding packets for one or several Soldiers from one of your templates.',
	area: 'onboarding',
	routes: ['onboarding'],
	keywords: ['new arrival', 'newcomer', 'inprocessing', 'in-processing', 'packet', 'start', 'reception', 'gaining'],
	feature: 'onboarding',
	access: { lane: 'onboarding', level: 'operate' },
	lead: 'Starting onboarding gives each Soldier their own packet built from a template. You can start several at once. You track each step on the Onboarding page until they finish.',
	steps: [
		{ text: 'On the Onboarding page, press **Start onboarding**.', to: 'onboarding' },
		{
			text: "Check the **Template**. Your unit's default is already chosen. If it has no default, pick one."
		},
		{ text: 'Set the **Start Date**. Every Soldier you choose gets the same date.' },
		{
			text: 'Search under **Members** and choose each Soldier, or press **Add Person** to add someone who is not in the unit yet. Add Person shows only if you can add Soldiers. Anyone already in onboarding is marked **Already onboarding**.'
		},
		{ text: 'Press **Start onboarding for** the number of people you chose.' }
	],
	note: 'The button stays off until a template has at least one step. A Training step a Soldier already has recorded starts checked off. If some Soldiers cannot start, the dialog stays open and lists each result so you can try the rest again. An owner or admin sets the default template on the Templates page.',
	next: 'build-onboarding-template'
};

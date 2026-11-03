import type { HelpGuide } from '../contracts';

export const buildOnboardingTemplate: HelpGuide = {
	id: 'build-onboarding-template',
	title: 'Build an onboarding checklist',
	summary: 'Make a template of the steps every new arrival works through.',
	area: 'onboarding',
	routes: ['onboarding', 'onboarding/templates'],
	keywords: ['template', 'checklist', 'inprocessing', 'in-processing', 'reception', 'steps', 'newcomer', 'sponsor'],
	feature: 'onboarding',
	access: { lane: 'onboarding', level: 'configure' },
	lead: 'A template is the checklist each new arrival works through. You build it once, and every packet you start uses it.',
	steps: [
		{ text: 'On the Onboarding page, press **Templates**.', to: 'onboarding/templates' },
		{ text: 'Press **New template**, enter a **Name**, and press **Create template**.' },
		{
			text: 'Press **Add step**, enter a **Step name**, and pick a **Type** of **Checkbox**, **Paperwork** or **Training**.'
		},
		{ text: 'For a Training step, pick its **Training Type**. Add **Instructions** for anything the step needs.' },
		{ text: 'Press **Save step**, then drag the steps into order.' }
	],
	note: 'Edits apply to new packets right away. Active packets update when you sync them.',
	next: 'start-onboarding'
};

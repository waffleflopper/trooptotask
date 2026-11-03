import type { HelpGuide } from '../contracts';

export const turnFeaturesOnOff: HelpGuide = {
	id: 'turn-features-on-off',
	title: 'Turn features on or off',
	summary: 'Hide the areas your unit does not use, such as onboarding or evals.',
	area: 'settings',
	routes: ['settings/features'],
	keywords: ['feature', 'turn off', 'hide', 'disable', 'enable', 'sidebar', 'strength floor', 'modules'],
	access: { role: 'admin' },
	lead: 'A feature that is off leaves the sidebar and the dashboard for everyone. Its records are kept, and it comes back exactly as it was.',
	steps: [
		{ text: 'In Unit settings, open **Features**.', to: 'settings/features' },
		{ text: 'Flip the switch beside each feature to turn it on or off.' },
		{ text: 'Set the **Strength floor**. Groups under it turn amber.' }
	]
};

import type { HelpGuide } from '../contracts';

export const addTrainingTypes: HelpGuide = {
	id: 'add-training-types',
	title: 'Add the training your unit tracks',
	summary: 'Set up each training, how long it is good for, and who needs it.',
	area: 'training',
	routes: ['training', 'training/types'],
	keywords: ['training type', 'requirement', 'expiration', 'renewal', 'annual', 'sharp', 'cpr', 'license', 'exempt'],
	feature: 'training',
	access: { lane: 'training', level: 'configure' },
	lead: 'Training types are the classes and qualifications your unit tracks, such as annual briefings or licenses. Each one sets how long it lasts and who needs it.',
	steps: [
		{ text: 'On the Training page, open the menu and choose **Manage types**.', to: 'training/types' },
		{ text: 'Press **New type** and enter a **Name**.' },
		{
			text: 'Under **Renewal**, pick **Every few months**, **Date on the card** or **Never expires**. Set **Good for**, **First warning** and **Final warning** when they show.'
		},
		{
			text: 'Under **Who needs it**, pick **Everyone**, **Only some** or **Optional**. Use **+ Add an exception** to leave people out.'
		},
		{ text: 'Press **Create type**.' }
	],
	note: 'The order on this page is the column order in the matrix and on reports.'
};

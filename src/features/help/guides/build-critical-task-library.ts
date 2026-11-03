import type { HelpGuide } from '../contracts';

export const buildCriticalTaskLibrary: HelpGuide = {
	id: 'build-critical-task-library',
	title: 'Build your critical task library',
	summary: 'Add the tasks your Soldiers must be trained on, by MOS, with how long each stays current.',
	area: 'criticalTasks',
	routes: ['critical-tasks', 'critical-tasks/library'],
	keywords: ['task library', 'critical task', 'mos', 'cttl', 'individual task', 'expiration', 'import tasks'],
	feature: 'criticalTasks',
	access: { lane: 'criticalTasks', level: 'configure', wholeUnit: true },
	lead: 'The task library is the list of critical tasks your unit tracks. Each task can apply to certain MOSs and expire on its own schedule.',
	steps: [
		{ text: 'On the Critical Tasks page, press **Task Library**.', to: 'critical-tasks/library' },
		{ text: 'Press **New Task** and enter a **Task code** and **Title**.' },
		{ text: 'Fill in **MOS applicability**, or leave it blank for all MOSs.' },
		{ text: 'Set **Expiration override** only when this task differs from the unit default.' },
		{ text: 'Press **Create Task**. To add many tasks at once, use **Import**.' }
	],
	note: 'Press **Defaults** to set the **Default expiration** for every task with no override.'
};

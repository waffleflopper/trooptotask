import { describe, expect, it, vi } from 'vitest';
import { buildSetupModel } from './model';
import { SETUP_STEPS, type SetupFacts } from './registry';
import { parseOrganizationSetup } from './state';
import { setupHasData } from './hasData';
import { loadOrganizationSetupFacts, type SetupFactReads } from './facts.server';

function emptyFacts(): SetupFacts {
	return {
		branch: null,
		groups: { status: 'ready', value: 0 },
		activeRanks: { status: 'ready', value: 42 },
		activePeople: { status: 'ready', value: 0 },
		statusTypes: { status: 'ready', value: 0 },
		assignmentTypes: { status: 'ready', value: 0 },
		trainingTypes: { status: 'ready', value: 0 },
		criticalTasks: { status: 'ready', value: 0 },
		evaluations: { status: 'ready', value: 0 },
		onboardingTemplates: { status: 'ready', value: 0 },
		events: { status: 'ready', value: 0 },
		taskings: { status: 'ready', value: 0 },
		members: { status: 'ready', value: 1 },
		pendingInvitations: { status: 'ready', value: 0 },
		lossWarningWindowDays: { status: 'ready', value: 90 }
	};
}

const reviewed = {
	welcome: 'reviewed',
	groups: 'reviewed',
	ranks: 'reviewed',
	personnel: 'reviewed',
	calendar: 'reviewed',
	training: 'reviewed',
	criticalTasks: 'reviewed',
	evaluations: 'reviewed',
	onboarding: 'reviewed',
	lossesAndAwards: 'reviewed',
	eventsAndTaskings: 'reviewed',
	invite: 'reviewed'
};

describe('Organization setup', () => {
	it('keeps an empty new unit unanswered until its data or review completes a step', () => {
		const model = buildSetupModel({ state: parseOrganizationSetup(null), facts: emptyFacts(), disabledFeatures: [] });
		expect(model.steps.map((step) => [step.key, step.state])).toEqual([
			['welcome', 'notAnswered'],
			['groups', 'notAnswered'],
			['ranks', 'notAnswered'],
			['personnel', 'notAnswered'],
			['calendar', 'notAnswered'],
			['training', 'notAnswered'],
			['criticalTasks', 'notAnswered'],
			['evaluations', 'notAnswered'],
			['onboarding', 'notAnswered'],
			['lossesAndAwards', 'notAnswered'],
			['eventsAndTaskings', 'notAnswered'],
			['invite', 'notAnswered']
		]);
		expect([model.reviewed, model.total, model.firstUnansweredSlug]).toEqual([0, 12, 'welcome']);
	});

	it.each([
		{ groups: 0, statuses: 0, assignments: 0, expected: ['notAnswered', 'notAnswered'] },
		{ groups: 1, statuses: 0, assignments: 0, expected: ['done', 'notAnswered'] },
		{ groups: 0, statuses: 1, assignments: 0, expected: ['notAnswered', 'done'] },
		{ groups: 0, statuses: 0, assignments: 1, expected: ['notAnswered', 'done'] }
	])('derives Groups and Calendar completion from their data', ({ groups, statuses, assignments, expected }) => {
		const model = buildSetupModel({
			state: parseOrganizationSetup(null),
			disabledFeatures: [],
			facts: {
				...emptyFacts(),
				groups: { status: 'ready', value: groups },
				statusTypes: { status: 'ready', value: statuses },
				assignmentTypes: { status: 'ready', value: assignments }
			}
		});
		expect(
			model.steps.filter((step) => step.key === 'groups' || step.key === 'calendar').map((step) => step.state)
		).toEqual(expected);
	});

	it('does not treat unavailable Groups or Calendar facts as completed data', () => {
		const model = buildSetupModel({
			state: parseOrganizationSetup(null),
			disabledFeatures: [],
			facts: {
				...emptyFacts(),
				groups: { status: 'error', message: 'Unavailable' },
				statusTypes: { status: 'error', message: 'Unavailable' },
				assignmentTypes: { status: 'error', message: 'Unavailable' }
			}
		});
		expect(
			model.steps
				.filter((step) => step.key === 'groups' || step.key === 'calendar')
				.map((step) => [step.key, step.state, step.loadErrors.map(({ source }) => source)])
		).toEqual([
			['groups', 'notAnswered', ['groups']],
			['calendar', 'notAnswered', ['statusTypes', 'assignmentTypes']]
		]);
	});

	it('uses Off before Done before Later and restores the earlier answer when a feature is enabled', () => {
		const state = parseOrganizationSetup({
			branch: 'army',
			answers: { training: 'reviewed', criticalTasks: 'later', evaluations: 'later', onboarding: 'later' }
		});
		const facts = {
			...emptyFacts(),
			activePeople: { status: 'ready', value: 1 },
			evaluations: { status: 'ready', value: 1 },
			events: { status: 'ready', value: 1 },
			pendingInvitations: { status: 'ready', value: 1 }
		} satisfies SetupFacts;
		const model = buildSetupModel({ state, facts, disabledFeatures: ['training', 'criticalTasks'] });
		expect(model.steps.map((step) => [step.key, step.state])).toEqual([
			['welcome', 'done'],
			['groups', 'notAnswered'],
			['ranks', 'notAnswered'],
			['personnel', 'done'],
			['calendar', 'notAnswered'],
			['training', 'off'],
			['criticalTasks', 'off'],
			['evaluations', 'done'],
			['onboarding', 'later'],
			['lossesAndAwards', 'notAnswered'],
			['eventsAndTaskings', 'done'],
			['invite', 'done']
		]);
		expect([model.reviewed, model.total, model.firstUnansweredSlug]).toEqual([8, 12, 'groups']);
		const enabled = buildSetupModel({ state, facts, disabledFeatures: [] });
		expect(
			enabled.steps.filter((step) => ['training', 'criticalTasks'].includes(step.key)).map((step) => step.state)
		).toEqual(['done', 'later']);
	});

	it('recognizes legacy review marks without applying a date cutoff to new units', () => {
		const state = parseOrganizationSetup({ answers: { groups: 'reviewed', ranks: 'reviewed', calendar: 'reviewed' } });
		const model = buildSetupModel({
			state,
			facts: { ...emptyFacts(), activePeople: { status: 'ready', value: 22 } },
			disabledFeatures: []
		});
		expect(model.steps.filter((step) => step.state === 'done').map((step) => step.key)).toEqual([
			'groups',
			'ranks',
			'personnel',
			'calendar'
		]);
		expect([model.reviewed, model.total, model.firstUnansweredSlug]).toEqual([4, 12, 'welcome']);
	});

	it('drops unknown or malformed stored entries while retaining valid answers and prompt dates', () => {
		expect(
			parseOrganizationSetup({
				branch: 'not-a-service',
				answers: { groups: 'reviewed', training: 'off', criticalTasks: 'later', removed: 'reviewed' },
				prompts: {
					setup: { snoozedUntil: '2026-10-28' },
					training: { never: true },
					removed: { never: true },
					ranks: { never: false },
					groups: { snoozedUntil: '2026-02-30' },
					calendar: { never: true, snoozedUntil: '2026-10-28' }
				},
				finishedAt: 'invalid',
				ignored: true
			})
		).toEqual({
			branch: null,
			answers: { groups: 'reviewed', criticalTasks: 'later' },
			finishedAt: null,
			prompts: { setup: { snoozedUntil: '2026-10-28' }, training: { never: true } }
		});
		expect(parseOrganizationSetup({ branch: 'navy', finishedAt: '2026-10-27T12:30:00+00:00' })).toEqual({
			branch: 'navy',
			answers: {},
			prompts: {},
			finishedAt: '2026-10-27T12:30:00+00:00'
		});
	});

	it.each([
		{ count: 0, active: false, template: false, expected: false },
		{ count: 1, active: true, template: true, expected: true },
		{ count: null, active: null, template: null, expected: null }
	])(
		'shares the data checks and keeps unavailable facts unknown: $expected',
		({ count, active, template, expected }) => {
			const facts = {
				trainingTypeCount: count,
				hasActiveCriticalTasks: active,
				ratingSchemeEntryCount: count,
				hasOnboardingTemplate: template
			};
			expect([
				setupHasData.training(facts),
				setupHasData.criticalTasks(facts),
				setupHasData.evaluations(facts),
				setupHasData.onboarding(facts)
			]).toEqual([expected, expected, expected, expected]);
		}
	);

	it.each(['reviewed', 'later', 'off'])(
		'removes a registry step from the rail, Done lists and progress: %s',
		(answer) => {
			const state = parseOrganizationSetup({
				answers: { ...reviewed, training: answer === 'later' ? 'later' : 'reviewed' }
			});
			const model = buildSetupModel({
				state,
				facts: emptyFacts(),
				disabledFeatures: answer === 'off' ? ['training'] : [],
				registry: SETUP_STEPS.filter((step) => step.key !== 'training')
			});
			expect(model.steps.map((step) => step.key)).toEqual([
				'welcome',
				'groups',
				'ranks',
				'personnel',
				'calendar',
				'criticalTasks',
				'evaluations',
				'onboarding',
				'lossesAndAwards',
				'eventsAndTaskings',
				'invite'
			]);
			expect(model.on.map((step) => step.key)).toEqual([
				'criticalTasks',
				'evaluations',
				'onboarding',
				'lossesAndAwards',
				'eventsAndTaskings'
			]);
			expect(model.later).toEqual([]);
			expect(model.off).toEqual([]);
			expect([model.reviewed, model.total, model.firstUnansweredSlug]).toEqual([11, 11, 'done']);
		}
	);

	it('removes a registry step from the resume target and accepts fixture release dates', () => {
		const state = parseOrganizationSetup({
			answers: {
				welcome: 'reviewed',
				groups: 'reviewed',
				ranks: 'reviewed',
				personnel: 'reviewed',
				calendar: 'reviewed'
			}
		});
		const registry = SETUP_STEPS.map((step) =>
			step.key === 'eventsAndTaskings' ? { ...step, since: '2027-01-01' } : step
		);
		expect(buildSetupModel({ state, facts: emptyFacts(), disabledFeatures: [], registry }).firstUnansweredSlug).toBe(
			'training'
		);
		const model = buildSetupModel({
			state,
			facts: emptyFacts(),
			disabledFeatures: [],
			registry: registry.filter((step) => step.key !== 'training')
		});
		expect(model.firstUnansweredSlug).toBe('critical-tasks');
		expect(model.unanswered.map((step) => [step.key, step.since ?? null])).toEqual([
			['criticalTasks', null],
			['evaluations', null],
			['onboarding', null],
			['lossesAndAwards', null],
			['eventsAndTaskings', '2027-01-01'],
			['invite', null]
		]);
	});

	it('starts independent facts together and retains successful sources when one fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		let personnelStarted = false;
		const reads: SetupFactReads = {
			groups: async () => {
				await blocked;
				return 4;
			},
			activeRanks: async () => 42,
			activePeople: async () => {
				personnelStarted = true;
				return 22;
			},
			statusTypes: async () => 7,
			assignmentTypes: async () => 2,
			trainingTypes: async () => {
				throw new Error('Synthetic source failure');
			},
			criticalTasks: async () => 1,
			evaluations: async () => 0,
			onboardingTemplates: async () => 0,
			events: async () => 0,
			taskings: async () => 1,
			members: async () => 2,
			pendingInvitations: async () => 0,
			lossWarningWindowDays: async () => 90
		};
		try {
			const pending = loadOrganizationSetupFacts(reads);
			expect(personnelStarted).toBe(true);
			release();
			const facts = await pending;
			expect(facts.trainingTypes).toMatchObject({ status: 'error' });
			expect(facts.activePeople).toEqual({ status: 'ready', value: 22 });
			const model = buildSetupModel({ state: parseOrganizationSetup(null), facts, disabledFeatures: [] });
			expect(model.steps.filter((step) => step.state === 'done').map((step) => step.key)).toEqual([
				'groups',
				'personnel',
				'calendar',
				'criticalTasks',
				'eventsAndTaskings',
				'invite'
			]);
			expect(
				model.steps
					.filter((step) => step.loadErrors.length > 0)
					.map((step) => ({ key: step.key, sources: step.loadErrors.map((error) => error.source), state: step.state }))
			).toEqual([{ key: 'training', sources: ['trainingTypes'], state: 'notAnswered' }]);
		} finally {
			release();
			log.mockRestore();
		}
	});
});

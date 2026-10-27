import { describe, expect, it } from 'vitest';
import { setupEntry, setupPromptStateForChoice } from './entry';
import type { SetupStep } from './registry';
import type { OrganizationSetup } from './state';

const empty: OrganizationSetup = { branch: null, answers: {}, finishedAt: null, prompts: {} };
const released: SetupStep = {
	key: 'training',
	slug: 'training',
	group: 'features',
	title: 'Training',
	pitch: '',
	featureSwitch: 'training',
	since: '2026-10-01',
	factSources: [],
	hasData: () => false
};
const second: SetupStep = { ...released, key: 'evaluations', slug: 'evaluations', featureSwitch: 'evaluations' };
const finishedAt = '2026-09-01T12:00:00Z';

type Input = Parameters<typeof setupEntry>[0];
function decide(overrides: Partial<Input> = {}) {
	return setupEntry({
		isOwner: true,
		state: empty,
		registry: [],
		disabledFeatures: [],
		organizationCreatedOn: '2026-01-01',
		today: '2026-10-27',
		...overrides
	});
}

describe('setupEntry', () => {
	it('gives a non-owner no invitation, feature prompt or resume even with pending steps and a snooze', () => {
		expect(
			decide({
				isOwner: false,
				registry: [released],
				state: { ...empty, prompts: { setup: { snoozedUntil: '2026-10-28' } } }
			})
		).toEqual({ prompt: null, resume: false });
	});

	it.each([
		['untouched', empty, { prompt: { kind: 'invitation' }, resume: false }],
		[
			'snoozed until tomorrow',
			{ ...empty, prompts: { setup: { snoozedUntil: '2026-10-28' } } },
			{ prompt: null, resume: true }
		],
		[
			'snooze ends today',
			{ ...empty, prompts: { setup: { snoozedUntil: '2026-10-27' } } },
			{ prompt: { kind: 'invitation' }, resume: true }
		],
		[
			'expired snooze',
			{ ...empty, prompts: { setup: { snoozedUntil: '2026-10-01' } } },
			{ prompt: { kind: 'invitation' }, resume: true }
		],
		['never ask again', { ...empty, prompts: { setup: { never: true } } }, { prompt: null, resume: false }],
		['finished', { ...empty, finishedAt }, { prompt: null, resume: false }],
		[
			'finished after snoozing',
			{ ...empty, finishedAt, prompts: { setup: { snoozedUntil: '2026-10-28' } } },
			{ prompt: null, resume: false }
		]
	] satisfies [string, OrganizationSetup, unknown][])(
		'%s setup decides invitation and resume together',
		(_, state, expected) => {
			expect(decide({ state })).toEqual(expected);
		}
	);

	it('gives the invitation priority over a new step', () => {
		expect(decide({ registry: [released] })).toEqual({ prompt: { kind: 'invitation' }, resume: false });
	});

	it('offers an unanswered new step after Finish', () => {
		expect(decide({ registry: [released], state: { ...empty, finishedAt } })).toEqual({
			prompt: { kind: 'newFeature', step: 'training' },
			resume: false
		});
	});

	it('can offer a new step during the setup invitation snooze', () => {
		expect(
			decide({ registry: [released], state: { ...empty, prompts: { setup: { snoozedUntil: '2026-10-28' } } } })
		).toEqual({ prompt: { kind: 'newFeature', step: 'training' }, resume: true });
	});

	it.each([null, finishedAt])('shows only resume for a new step after setup never, finishedAt %s', (finishedAt) => {
		expect(
			decide({ registry: [released], state: { ...empty, finishedAt, prompts: { setup: { never: true } } } })
		).toEqual({ prompt: null, resume: true });
	});

	it.each(['reviewed', 'later'] as const)('settles a new step answered %s', (answer) => {
		expect(decide({ registry: [released], state: { ...empty, finishedAt, answers: { training: answer } } })).toEqual({
			prompt: null,
			resume: false
		});
	});

	it('settles a switched-off feature even after setup never', () => {
		expect(
			decide({
				registry: [released],
				disabledFeatures: ['training'],
				state: { ...empty, prompts: { setup: { never: true } } }
			})
		).toEqual({ prompt: null, resume: false });
	});

	it.each(['2025-12-31', '2026-01-01', undefined])(
		'does not announce a step released %s to a unit created January 1',
		(since) => {
			expect(decide({ registry: [{ ...released, since }], state: { ...empty, finishedAt } })).toEqual({
				prompt: null,
				resume: false
			});
		}
	);

	it('settles a feature prompt never independently of setup', () => {
		expect(
			decide({ registry: [released], state: { ...empty, finishedAt, prompts: { training: { never: true } } } })
		).toEqual({ prompt: null, resume: false });
		expect(decide({ registry: [released], state: { ...empty, prompts: { training: { never: true } } } })).toEqual({
			prompt: { kind: 'invitation' },
			resume: false
		});
	});

	it.each([
		['2026-10-28', { prompt: null, resume: true }],
		['2026-10-27', { prompt: { kind: 'newFeature', step: 'training' }, resume: true }],
		['2026-10-26', { prompt: { kind: 'newFeature', step: 'training' }, resume: true }]
	])('keeps resume while a new step snooze dated %s waits for an answer', (snoozedUntil, expected) => {
		expect(
			decide({ registry: [released], state: { ...empty, finishedAt, prompts: { training: { snoozedUntil } } } })
		).toEqual(expected);
	});

	it('offers at most one new prompt in registry order, skipping a snoozed or declined step', () => {
		expect(decide({ registry: [released, second], state: { ...empty, finishedAt } })).toEqual({
			prompt: { kind: 'newFeature', step: 'training' },
			resume: false
		});
		expect(
			decide({
				registry: [released, second],
				state: { ...empty, finishedAt, prompts: { training: { snoozedUntil: '2026-10-28' } } }
			})
		).toEqual({ prompt: { kind: 'newFeature', step: 'evaluations' }, resume: true });
		expect(
			decide({ registry: [released, second], state: { ...empty, finishedAt, prompts: { training: { never: true } } } })
		).toEqual({ prompt: { kind: 'newFeature', step: 'evaluations' }, resume: false });
	});

	it('removes prompts and resume when their step leaves the registry', () => {
		expect(decide({ state: { ...empty, finishedAt, prompts: { training: { snoozedUntil: '2026-10-28' } } } })).toEqual({
			prompt: null,
			resume: false
		});
	});
});

describe('setupPromptStateForChoice', () => {
	it.each([
		['2026-10-27', { snoozedUntil: '2026-10-28' }],
		['2026-12-31', { snoozedUntil: '2027-01-01' }],
		['2028-02-28', { snoozedUntil: '2028-02-29' }],
		['2026-03-08', { snoozedUntil: '2026-03-09' }]
	])('snoozes to the calendar day after %s', (today, expected) => {
		expect(setupPromptStateForChoice('tomorrow', today)).toEqual(expected);
	});
	it('records never', () => {
		expect(setupPromptStateForChoice('never', '2026-10-27')).toEqual({ never: true });
	});
});

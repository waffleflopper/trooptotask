// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { SetupFacts, SetupStepKey } from './registry';
import type { OrganizationSetup } from './state';
import { SetupFlow, type SetupFlowSource } from './setupFlow.svelte';

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(async (_dependency: string) => {}) }));
vi.mock('$app/navigation', () => ({ invalidate }));

const ready = (value: number) => ({ status: 'ready', value }) as const;

function facts(overrides: Partial<SetupFacts> = {}): SetupFacts {
	return {
		branch: null,
		groups: ready(0),
		activeRanks: ready(0),
		activePeople: ready(0),
		statusTypes: ready(0),
		assignmentTypes: ready(0),
		trainingTypes: ready(0),
		criticalTasks: ready(0),
		evaluations: ready(0),
		onboardingTemplates: ready(0),
		events: ready(0),
		taskings: ready(0),
		members: ready(1),
		pendingInvitations: ready(0),
		lossWarningWindowDays: ready(90),
		...overrides
	};
}

const empty: OrganizationSetup = { branch: null, answers: {}, finishedAt: null, prompts: {} };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

function respond(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(stepKey: SetupStepKey | null, unitFacts = facts()) {
	const source = $state<SetupFlowSource>({
		orgUrlSegment: 'alpha',
		isOwner: true,
		disabledFeatures: [],
		setupState: empty,
		setupFacts: Promise.resolve(unitFacts),
		stepKey,
		navigating: false
	});
	const navigate = vi.fn(async (_href: string) => {});
	let flow!: SetupFlow;
	const destroy = $effect.root(() => {
		flow = new SetupFlow(() => ({ ...source }), navigate);
	});
	cleanups.push(destroy);
	return { flow, navigate, source };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
	cleanups.splice(0).forEach((destroy) => destroy());
	vi.unstubAllGlobals();
	invalidate.mockClear();
});

async function settle() {
	await new Promise((done) => setTimeout(done, 0));
	flushSync();
}

describe('Continue', () => {
	it('records the step reviewed, then opens the next step', async () => {
		const fetch = vi.fn(async () => respond(200, { ...empty, answers: { groups: 'reviewed' } }));
		vi.stubGlobal('fetch', fetch);
		const { flow, navigate } = setup('groups');
		await settle();

		await flow.continue();

		expect(fetch).toHaveBeenCalledWith(
			'/org/alpha/api/organization/setup/answer',
			expect.objectContaining({ body: JSON.stringify({ step: 'groups', answer: 'reviewed' }) })
		);
		expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/ranks');
		expect(flow.rail.find((step) => step.key === 'groups')?.state).toBe('done');
	});

	it('keeps a saved answer when the next step opens without reloading setup state', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(200, { ...empty, answers: { groups: 'reviewed' } }))
		);
		const { flow, source } = setup('groups');
		await settle();

		await flow.continue();
		source.stepKey = 'ranks';

		expect(flow.rail.find((step) => step.key === 'groups')?.state).toBe('done');
	});

	it('takes reloaded setup state over an earlier saved answer', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(200, { ...empty, answers: { groups: 'reviewed' } }))
		);
		const { flow, source } = setup('groups');
		await settle();

		await flow.continue();
		source.setupState = { ...empty, answers: { groups: 'later' } };

		expect(flow.rail.find((step) => step.key === 'groups')?.state).toBe('later');
	});

	it('writes nothing when the unit data already makes the step Done', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const { flow, navigate } = setup('personnel', facts({ activePeople: ready(3) }));
		await settle();

		await flow.continue();

		expect(fetch).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/calendar');
	});

	it('opens Done after the last step', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(200, { ...empty, answers: { invite: 'reviewed' } }))
		);
		const { flow, navigate } = setup('invite');
		await settle();

		await flow.continue();

		expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/done');
	});

	it('keeps the owner on the step with the error when the write fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(500, { message: 'Database unavailable' }))
		);
		const { flow, navigate } = setup('ranks');
		await settle();

		await flow.continue();

		expect(navigate).not.toHaveBeenCalled();
		expect(flow.error).toBe('Database unavailable');
		expect(flow.pending).toBe(false);
		expect(flow.rail.find((step) => step.key === 'ranks')?.state).toBe('notAnswered');
	});

	it('uses a step body save in place of the default and stays put when it rejects', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const { flow, navigate } = setup('ranks');
		await settle();

		await flow.continue(async () => {
			throw new Error('Rank pack failed');
		});

		expect(fetch).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(flow.error).toBe('Rank pack failed');
	});

	it('ignores a response that arrives after the owner moved to another step', async () => {
		const response = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => response.promise)
		);
		const { flow, navigate, source } = setup('groups');
		await settle();

		const saving = flow.continue();
		await settle();
		flow.leave();
		source.stepKey = 'training';
		response.resolve(respond(200, { ...empty, answers: { groups: 'reviewed' } }));
		await saving;

		expect(navigate).not.toHaveBeenCalled();
		expect(flow.rail.find((step) => step.key === 'groups')?.state).toBe('notAnswered');
		expect(flow.pending).toBe(false);
		expect(flow.error).toBeNull();
	});

	it('starts nothing while a navigation to another step is pending', async () => {
		const fetch = vi.fn(async () => respond(200, { ...empty, answers: { groups: 'reviewed' } }));
		vi.stubGlobal('fetch', fetch);
		const { flow, navigate, source } = setup('groups');
		await settle();

		flow.leave();
		source.navigating = true;
		const saving = flow.continue();
		expect(flow.busy).toBe(true);
		source.navigating = false;
		source.stepKey = 'training';
		await saving;
		await settle();

		expect(fetch).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(flow.rail.find((step) => step.key === 'groups')?.state).toBe('notAnswered');
		expect(flow.busy).toBe(false);
	});

	it('keeps a write when the owner reopens the step already shown', async () => {
		const response = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => response.promise)
		);
		const { flow } = setup('groups');
		await settle();

		const saving = flow.answer('groups', 'reviewed');
		flow.leave('/org/alpha/setup/groups', '/org/alpha/setup/groups');
		response.resolve(respond(200, { ...empty, answers: { groups: 'reviewed' } }));
		await saving;

		expect(flow.rail.find((step) => step.key === 'groups')?.state).toBe('done');
	});

	it('drops a write once the owner opens another step', async () => {
		const response = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => response.promise)
		);
		const { flow } = setup('groups');
		await settle();

		const saving = flow.answer('groups', 'reviewed');
		flow.leave('/org/alpha/setup/groups', '/org/alpha/setup/ranks');
		response.resolve(respond(200, { ...empty, answers: { groups: 'reviewed' } }));
		await saving;

		expect(flow.rail.find((step) => step.key === 'groups')?.state).toBe('notAnswered');
	});

	it('shows no error from a failed write the owner already left', async () => {
		const response = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => response.promise)
		);
		const { flow } = setup('groups');
		await settle();

		const saving = flow.continue();
		await settle();
		flow.leave();
		response.resolve(respond(500, { message: 'Database unavailable' }));
		await saving;

		expect(flow.error).toBeNull();
	});
});

describe('Finish', () => {
	it('records the finish, then lands on the Dashboard', async () => {
		const finishedAt = '2026-10-26T12:00:00.000Z';
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond(200, { ...empty, finishedAt }))
		);
		const { flow, navigate } = setup(null);
		await settle();

		await flow.finish();

		expect(flow.state.finishedAt).toBe(finishedAt);
		expect(navigate).toHaveBeenCalledWith('/org/alpha', { invalidate: ['app:organization-setup'] });
	});

	it('does not leave for the Dashboard when the finish lands after the owner moved on', async () => {
		const response = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => response.promise)
		);
		const { flow, navigate } = setup(null);
		await settle();

		const finishing = flow.finish();
		flow.leave();
		response.resolve(respond(200, { ...empty, finishedAt: '2026-10-26T12:00:00.000Z' }));
		await finishing;

		expect(navigate).not.toHaveBeenCalled();
		expect(flow.state.finishedAt).toBeNull();
	});
	it('does not finish while a navigation away from Done is pending', async () => {
		const fetch = vi.fn(async () => respond(200, { ...empty, finishedAt: '2026-10-26T12:00:00.000Z' }));
		vi.stubGlobal('fetch', fetch);
		const { flow, navigate, source } = setup(null);
		await settle();

		flow.leave();
		source.navigating = true;
		await flow.finish();

		expect(fetch).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(flow.state.finishedAt).toBeNull();
	});
});

describe('Facts', () => {
	it('marks only the steps whose fact source failed and keeps the rest derived', async () => {
		const { flow } = setup('welcome', facts({ trainingTypes: { status: 'error', message: 'timeout' } }));
		expect(flow.rail.every((step) => step.state === null)).toBe(true);
		await settle();

		const withErrors = flow.rail.filter((step) => step.loadErrors.length > 0).map((step) => step.key);
		expect(withErrors).toEqual(['training']);
		expect(flow.rail.find((step) => step.key === 'invite')?.state).toBe('notAnswered');
	});
});

describe('Finish later', () => {
	it.each([
		['declined', { ...empty, prompts: { setup: { never: true as const } } }],
		['finished', { ...empty, finishedAt: '2026-10-26T12:00:00.000Z' }]
	])('leaves %s setup without changing prompt state', async (_, state) => {
		const writes: unknown[] = [];
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			writes.push(init.body);
			return respond(200, { ...empty, prompts: { setup: { snoozedUntil: '2026-10-28' } } });
		});
		const { flow, source, navigate } = setup('ranks');
		source.setupState = state;
		await settle();

		await flow.finishLater();

		expect(writes).toEqual([]);
		expect(navigate).toHaveBeenCalledWith('/org/alpha', { invalidate: ['app:organization-setup'] });
		expect(flow.state).toEqual(state);
	});

	it('awaits the owner snooze before applying state and opening the Dashboard', async () => {
		const response = deferred<Response>();
		const writes: unknown[] = [];
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			writes.push({ url, body: JSON.parse(String(init.body)) });
			return response.promise;
		});
		const { flow, navigate, source } = setup('ranks');
		source.setupState = { ...empty, branch: 'army', answers: { groups: 'reviewed' } };
		await settle();

		const leaving = flow.finishLater();
		await flow.finishLater();
		expect(flow.pending).toBe(true);
		expect(navigate).not.toHaveBeenCalled();
		expect(writes).toEqual([
			{ url: '/org/alpha/api/organization/setup/prompt', body: { key: 'setup', choice: 'tomorrow' } }
		]);
		response.resolve(respond(200, { ...source.setupState, prompts: { setup: { snoozedUntil: '2026-10-28' } } }));
		await leaving;

		expect(flow.state).toEqual({
			branch: 'army',
			answers: { groups: 'reviewed' },
			finishedAt: null,
			prompts: { setup: { snoozedUntil: '2026-10-28' } }
		});
		expect(navigate).toHaveBeenCalledWith('/org/alpha', { invalidate: ['app:organization-setup'] });
		expect(flow.pending).toBe(false);
	});

	it('takes an admin to the Dashboard without changing prompt state', async () => {
		const writes: unknown[] = [];
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			writes.push(init.body);
			return respond(200, empty);
		});
		const { flow, source, navigate } = setup('ranks');
		source.isOwner = false;
		await settle();

		await flow.finishLater();

		expect(navigate).toHaveBeenCalledWith('/org/alpha', { invalidate: ['app:organization-setup'] });
		expect(flow.state).toEqual({ branch: null, answers: {}, finishedAt: null, prompts: {} });
		expect(writes).toEqual([]);
	});

	it('keeps the owner on the step and shows a failed snooze for retry', async () => {
		vi.stubGlobal('fetch', async () => respond(503, { message: 'Storage unavailable' }));
		const { flow, navigate } = setup('ranks');
		await settle();

		await flow.finishLater();

		expect(flow.error).toBe('Storage unavailable');
		expect(flow.pending).toBe(false);
		expect(flow.state).toEqual({ branch: null, answers: {}, finishedAt: null, prompts: {} });
		expect(navigate).not.toHaveBeenCalled();
	});

	it.each([200, 503])('ignores a late %s snooze after switching units', async (status) => {
		const response = deferred<Response>();
		vi.stubGlobal('fetch', () => response.promise);
		const { flow, source, navigate } = setup('ranks');
		await settle();

		const leaving = flow.finishLater();
		flow.leave('/org/alpha/setup/ranks', '/org/bravo/setup/ranks');
		source.orgUrlSegment = 'bravo';
		response.resolve(
			respond(
				status,
				status === 200
					? { ...empty, prompts: { setup: { snoozedUntil: '2026-10-28' } } }
					: { message: 'Storage unavailable' }
			)
		);
		await leaving;

		expect(flow.dashboardHref).toBe('/org/bravo');
		expect(flow.state).toEqual({ branch: null, answers: {}, finishedAt: null, prompts: {} });
		expect(flow.error).toBeNull();
		expect(flow.pending).toBe(false);
		expect(navigate).not.toHaveBeenCalled();
	});
});

describe('saveBranch', () => {
	it('applies the saved branch to the open step', async () => {
		const fetch = vi.fn(async () => respond(200, { ...empty, branch: 'army' }));
		vi.stubGlobal('fetch', fetch);
		const { flow } = setup('welcome');
		await settle();

		expect(await flow.saveBranch('army')).toBe(true);

		expect(fetch).toHaveBeenCalledWith(
			'/org/alpha/api/organization/setup/branch',
			expect.objectContaining({ body: JSON.stringify({ branch: 'army' }) })
		);
		expect(flow.state.branch).toBe('army');
		expect(flow.rail.find((step) => step.key === 'welcome')?.state).toBe('done');
	});

	it('ignores a response that arrives after the owner left', async () => {
		const response = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => response.promise)
		);
		const { flow } = setup('welcome');
		await settle();

		const saving = flow.saveBranch('navy');
		flow.leave();
		response.resolve(respond(200, { ...empty, branch: 'navy' }));

		expect(await saving).toBe(false);
		expect(flow.state.branch).toBeNull();
	});
});

describe('Writes that change the unit', () => {
	it('reloads the feature switches and setup facts after a switch the owner already left', async () => {
		const response = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => response.promise)
		);
		const { flow } = setup('training');
		await settle();

		const switching = flow.switchFeature('training', false);
		flow.leave();
		response.resolve(respond(200, {}));

		expect(await switching).toBe(false);
		expect(invalidate.mock.calls.map(([dependency]) => dependency).sort()).toEqual([
			'app:org-core',
			'app:organization-setup'
		]);
	});

	it.each([false, true])('posts Calendar picks and ignores a response after leaving: %s', async (left) => {
		const response = deferred<Response>();
		const requests: { url: string; body: unknown }[] = [];
		vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
			requests.push({ url, body: JSON.parse(String(init.body)) });
			return response.promise;
		});
		const { flow } = setup('calendar');
		await settle();
		const adding = flow.addCalendarSuggestions({ statusIds: ['leave'], assignmentIds: ['staff-duty'] });
		if (left) flow.leave();
		response.resolve(
			respond(200, { failed: [], statusTypes: [{ id: 'leave-saved' }], assignmentTypes: [{ id: 'duty-saved' }] })
		);
		expect(await adding).toEqual(
			left ? null : { failed: [], statusTypes: [{ id: 'leave-saved' }], assignmentTypes: [{ id: 'duty-saved' }] }
		);
		expect(requests).toEqual([
			{ url: '/org/alpha/api/calendar-suggestions', body: { statusIds: ['leave'], assignmentIds: ['staff-duty'] } }
		]);
		expect(invalidate).toHaveBeenCalledWith('app:organization-setup');
	});

	it('reloads the setup facts after suggestions the owner already left', async () => {
		const response = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => response.promise)
		);
		const { flow } = setup('training');
		await settle();

		const adding = flow.addTrainingSuggestions('army', ['opsec']);
		flow.leave();
		response.resolve(respond(200, { added: 1 }));

		expect(await adding).toBeNull();
		expect(invalidate).toHaveBeenCalledWith('app:organization-setup');
	});
});

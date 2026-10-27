// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { SetupFacts, SetupStepKey } from './registry';
import type { OrganizationSetup } from './state';
import { SetupFlow, type SetupFlowSource } from './setupFlow.svelte';

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
		expect(navigate).toHaveBeenCalledWith('/org/alpha');
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

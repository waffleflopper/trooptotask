// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { SetupFacts, SetupStepKey } from './registry';
import type { OrganizationSetup } from './state';
import type { SetupStepSupport } from './featureStepSupport';
import SetupFlowHarness from './test-support/SetupFlowHarness.svelte';

const invalidate = vi.hoisted(() => vi.fn(async (_dependency: string) => {}));
vi.mock('$app/navigation', () => ({ invalidate, goto: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	invalidate.mockClear();
});

const ready = (value: number) => ({ status: 'ready', value }) as const;
const facts: SetupFacts = {
	branch: 'army',
	groups: ready(3),
	activeRanks: ready(28),
	activePeople: ready(4),
	statusTypes: ready(7),
	assignmentTypes: ready(2),
	trainingTypes: ready(0),
	criticalTasks: ready(0),
	evaluations: ready(0),
	onboardingTemplates: ready(0),
	events: ready(0),
	taskings: ready(0),
	members: ready(1),
	pendingInvitations: ready(0),
	lossWarningWindowDays: ready(90)
};
const state: OrganizationSetup = { branch: 'army', answers: {}, finishedAt: null, prompts: {} };

const armyList = [
	{ id: 'sharp', name: 'SHARP', expirationMonths: 12 },
	{ id: 'eo', name: 'Equal Opportunity', expirationMonths: 12 },
	{ id: 'ace', name: 'Suicide Prevention (ACE)', expirationMonths: 12 },
	{ id: 'opsec', name: 'OPSEC', expirationMonths: 12 }
];

function respond(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Route = (body: Record<string, unknown> | null) => Response;

function stubFetch(routes: Record<string, Route>) {
	const posts: { path: string; body: Record<string, unknown> | null }[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			const path = url.replace('/org/alpha', '');
			const body = init?.body ? JSON.parse(String(init.body)) : null;
			if (init?.method === 'POST') posts.push({ path, body });
			const route = routes[`${init?.method ?? 'GET'} ${path}`];
			if (!route) throw new Error(`Unexpected request ${init?.method ?? 'GET'} ${path}`);
			return route(body);
		})
	);
	return posts;
}

function open(
	stepKey: SetupStepKey,
	{ disabledFeatures = [], support }: { disabledFeatures?: FeatureKey[]; support?: Partial<SetupStepSupport> } = {}
) {
	const navigate = vi.fn(async (_href: string) => {});
	render(SetupFlowHarness, {
		props: {
			source: {
				orgUrlSegment: 'alpha',
				disabledFeatures,
				setupState: state,
				setupFacts: Promise.resolve(facts),
				stepKey
			},
			support: {
				access: createClientAccess({ membershipRole: 'owner' }),
				trainingSuggestions: (branch) => (branch === 'army' ? armyList : []),
				...support
			},
			navigate
		}
	});
	return navigate;
}

const continueButton = () => screen.getByRole('button', { name: /continue/i });

it('turns a feature off through the Settings switch, then opens the next step', async () => {
	const posts = stubFetch({ 'POST /api/organization/settings': () => respond(200, { success: true }) });
	const navigate = open('evaluations');

	await fireEvent.click(screen.getByRole('radio', { name: /We won’t use it/ }));
	await fireEvent.click(screen.getByRole('button', { name: 'Turn off Evaluations and continue' }));

	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/onboarding'));
	expect(posts).toEqual([
		{ path: '/api/organization/settings', body: { featureSwitch: { feature: 'evaluations', on: false } } }
	]);
	expect(invalidate.mock.calls.map(([dependency]) => dependency).sort()).toEqual([
		'app:org-core',
		'app:organization-setup'
	]);
});

it('keeps the owner on the step when the switch write fails', async () => {
	stubFetch({ 'POST /api/organization/settings': () => respond(409, { message: 'Settings changed. Try again.' }) });
	const navigate = open('evaluations');

	await fireEvent.click(screen.getByRole('radio', { name: /We won’t use it/ }));
	await fireEvent.click(screen.getByRole('button', { name: 'Turn off Evaluations and continue' }));

	expect(await screen.findByRole('alert')).toHaveTextContent('Settings changed. Try again.');
	expect(navigate).not.toHaveBeenCalled();
	expect(invalidate).not.toHaveBeenCalled();
});

it('opens an off feature on We won’t use it and turns it back on in place', async () => {
	const posts = stubFetch({ 'POST /api/organization/settings': () => respond(200, { success: true }) });
	open('criticalTasks', { disabledFeatures: ['criticalTasks'] });

	expect(screen.getByRole('radio', { name: /We won’t use it/ })).toBeChecked();
	await fireEvent.click(screen.getByRole('button', { name: /back on/i }));

	await waitFor(() =>
		expect(posts).toEqual([
			{ path: '/api/organization/settings', body: { featureSwitch: { feature: 'criticalTasks', on: true } } }
		])
	);
});

it('records Later without touching the switch', async () => {
	const posts = stubFetch({
		'POST /api/organization/setup/answer': () => respond(200, { ...state, answers: { criticalTasks: 'later' } })
	});
	const navigate = open('criticalTasks');

	await fireEvent.click(screen.getByRole('radio', { name: /Later/ }));
	await fireEvent.click(continueButton());

	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/evaluations'));
	expect(posts).toEqual([{ path: '/api/organization/setup/answer', body: { step: 'criticalTasks', answer: 'later' } }]);
});

it('adds only the picked suggestions the unit does not have yet', async () => {
	const posts = stubFetch({
		'GET /api/training-types': () => respond(200, [{ name: 'SHARP' }]),
		'POST /api/training-types/suggestions': () =>
			respond(200, { failed: [], trainingTypes: [{ name: 'SHARP' }, { name: 'Equal Opportunity' }] })
	});
	const navigate = open('training');

	await waitFor(() => expect(screen.getByRole('checkbox', { name: /SHARP/ })).toBeDisabled());
	await fireEvent.click(screen.getByRole('checkbox', { name: /Suicide Prevention/ }));
	await fireEvent.click(screen.getByRole('checkbox', { name: /OPSEC/ }));
	await fireEvent.click(continueButton());

	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/critical-tasks'));
	expect(posts).toEqual([{ path: '/api/training-types/suggestions', body: { branch: 'army', suggestionIds: ['eo'] } }]);
});

it('stays on Training when some suggestions fail', async () => {
	stubFetch({
		'GET /api/training-types': () => respond(200, []),
		'POST /api/training-types/suggestions': () =>
			respond(200, {
				failed: [{ id: 'opsec', name: 'OPSEC', expirationMonths: 12, message: 'Try again.' }],
				trainingTypes: [{ name: 'SHARP' }, { name: 'Equal Opportunity' }, { name: 'Suicide Prevention (ACE)' }]
			})
	});
	const navigate = open('training');

	await waitFor(() => expect(continueButton()).toBeEnabled());
	await fireEvent.click(continueButton());

	expect(await screen.findByRole('alert')).toHaveTextContent('OPSEC');
	expect(navigate).not.toHaveBeenCalled();
	expect(screen.getByRole('checkbox', { name: /SHARP/ })).toBeDisabled();
	expect(screen.getByRole('checkbox', { name: /OPSEC/ })).toBeEnabled();
});

it('shows a viewer without Training configure the step but no picks', async () => {
	const posts = stubFetch({
		'POST /api/organization/setup/answer': () => respond(200, { ...state, answers: { training: 'reviewed' } })
	});
	const navigate = open('training', {
		support: {
			access: createClientAccess({
				membershipRole: 'admin',
				capabilityMap: { ...createCapabilityMap('configure'), training: 'view' }
			})
		}
	});

	expect(screen.queryByRole('checkbox')).toBeNull();
	await fireEvent.click(continueButton());

	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/critical-tasks'));
	expect(posts).toEqual([{ path: '/api/organization/setup/answer', body: { step: 'training', answer: 'reviewed' } }]);
});

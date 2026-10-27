// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	enhanceRequests,
	frameworkOutcome,
	simulateEnhance,
	type FrameworkPage
} from '$lib/test-support/sveltekitEnhance';
import type { SetupFacts } from './registry';
import type { SetupFlow, SetupFlowSource } from './setupFlow.svelte';
import type { SetupTeamData } from './teamTypes';
import SetupFlowCapture from './test-support/SetupFlowCapture.svelte';

const { pageData, invalidate } = vi.hoisted(() => ({
	pageData: { setupTeam: null as Promise<unknown> | null },
	invalidate: vi.fn(async (_dependency: string) => {})
}));

vi.mock('$app/navigation', () => ({ invalidate, goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { data: pageData } }));
vi.mock('$app/forms', () => ({ enhance: simulateEnhance }));

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

const team = (overrides: Partial<SetupTeamData> = {}): SetupTeamData => ({
	canInvite: true,
	isOwner: true,
	groups: [{ id: 'g-1', name: 'HQ PLT' }],
	invitations: [],
	...overrides
});

let flow!: SetupFlow;

function renderStep(data: Promise<SetupTeamData>, unitFacts = facts()) {
	pageData.setupTeam = data;
	const source: SetupFlowSource = {
		orgUrlSegment: 'alpha',
		isOwner: true,
		disabledFeatures: [],
		setupState: { branch: null, answers: {}, finishedAt: null, prompts: {} },
		setupFacts: Promise.resolve(unitFacts),
		stepKey: 'invite',
		navigating: false
	};
	return render(SetupFlowCapture, { props: { source, onflow: (created: SetupFlow) => (flow = created) } });
}

const emailField = () =>
	waitFor(() => {
		const field = document.querySelector<HTMLInputElement>('input[type="email"]');
		if (!field) throw new Error('The invitation form has not rendered.');
		return field;
	});
const sendButton = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]');

async function send(email: string) {
	await fireEvent.input(await emailField(), { target: { value: email } });
	await fireEvent.click(sendButton()!);
	await waitFor(() => expect(enhanceRequests).toHaveLength(1));
}

// The Members action lives on another route, so SvelteKit applies a success or failure there, not on this page.
let framework: FrameworkPage;

const settle = (result: Parameters<(typeof enhanceRequests)[number]>[0]['result'], request = 0) =>
	enhanceRequests[request](frameworkOutcome(result, framework));

const stepPath = '/org/alpha/setup/invite';

beforeEach(() => {
	framework = { applyForm: async () => {}, away: true };
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(JSON.stringify({ branch: null, answers: {}, finishedAt: null, prompts: {} }), { status: 200 })
		)
	);
});

afterEach(() => {
	enhanceRequests.length = 0;
	invalidate.mockClear();
	vi.unstubAllGlobals();
	cleanup();
});

describe('Invite your team step', () => {
	it('posts to the Members invite action and refreshes the setup facts after a sent invitation', async () => {
		renderStep(Promise.resolve(team()));
		await send('new.person@example.com');

		const form = (await emailField()).closest('form')!;
		expect(form.getAttribute('action')).toBe('/org/alpha/settings/members?/invite');

		await settle({ type: 'success', status: 200, data: { inviteSuccess: true, inviteMessage: 'Invited.' } });

		expect(invalidate).toHaveBeenCalledWith('app:organization-setup');
		expect(await emailField()).toHaveValue('');
		expect(screen.getByRole('status')).toHaveTextContent('Invited.');
	});

	it('keeps the draft and shows the reason when the invitation fails', async () => {
		renderStep(Promise.resolve(team()));
		await send('new.person@example.com');

		await settle({ type: 'failure', status: 400, data: { inviteError: 'That address is already a member.' } });

		expect(screen.getByRole('alert')).toHaveTextContent('That address is already a member.');
		expect(await emailField()).toHaveValue('new.person@example.com');
		expect(invalidate).not.toHaveBeenCalled();
		expect(sendButton()).not.toHaveAttribute('aria-disabled');
	});

	it('keeps the draft when the request errors instead of replacing the page', async () => {
		renderStep(Promise.resolve(team()));
		await send('new.person@example.com');

		await settle({ type: 'error', status: 500, error: { message: 'boom' } });

		expect(screen.getByRole('alert')).toBeInTheDocument();
		expect(await emailField()).toHaveValue('new.person@example.com');
	});

	it('ignores a response that arrives after the owner left the step', async () => {
		renderStep(Promise.resolve(team()));
		await send('new.person@example.com');

		flow.leave(stepPath, '/org/alpha/setup/done');
		await settle({ type: 'success', status: 200, data: { inviteSuccess: true } });

		expect(invalidate).not.toHaveBeenCalled();
		expect(await emailField()).toHaveValue('new.person@example.com');
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('finishes a send when the owner reopens the step it is on', async () => {
		renderStep(Promise.resolve(team()));
		await send('new.person@example.com');

		flow.leave(stepPath, stepPath);
		await settle({ type: 'success', status: 200, data: { inviteSuccess: true } });

		expect(invalidate).toHaveBeenCalledWith('app:organization-setup');
		await waitFor(() => expect(screen.getByRole('button', { name: /^Continue/ })).toBeEnabled());
		await fireEvent.input(await emailField(), { target: { value: 'second.person@example.com' } });
		await fireEvent.click(sendButton()!);
		await waitFor(() => expect(enhanceRequests).toHaveLength(2));
	});

	it('follows a redirect from the invite action', async () => {
		renderStep(Promise.resolve(team()));
		await send('new.person@example.com');

		await settle({ type: 'redirect', status: 303, location: '/auth/login' });

		expect(framework.location).toBe('/auth/login');
	});

	it('holds Continue while an invitation is sending', async () => {
		renderStep(Promise.resolve(team()));
		await send('new.person@example.com');

		expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
		await settle({ type: 'success', status: 200, data: { inviteSuccess: true } });
		await waitFor(() => expect(screen.getByRole('button', { name: /^Continue/ })).toBeEnabled());
	});

	it('lists the pending invitations beside the form', async () => {
		renderStep(
			Promise.resolve(
				team({
					invitations: [
						{
							id: 'invite-1',
							email: 'waiting@example.com',
							membershipRole: 'member',
							createdAt: new Date().toISOString(),
							access: { memberPreset: 'operator' },
							funnelStatusLabel: 'Waiting on them to accept'
						} as never
					]
				})
			)
		);

		expect(await screen.findByText('waiting@example.com')).toBeInTheDocument();
	});

	it('shows a viewer without the invite action no form', async () => {
		renderStep(Promise.resolve(team({ canInvite: false, groups: [] })));

		expect(await screen.findByRole('button', { name: /^Continue/ })).toBeEnabled();
		await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
		expect(sendButton()).toBeNull();
		expect(document.querySelector('input[type="email"]')).toBeNull();
	});

	it('reserves the form region while its data loads', () => {
		renderStep(new Promise(() => {}));

		expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(sendButton()).toBeNull();
	});

	it('offers a retry when the form data fails to load', async () => {
		renderStep(Promise.reject(new Error('down')));

		await fireEvent.click(within(await screen.findByRole('alert')).getByRole('button'));

		expect(invalidate).toHaveBeenCalledWith('app:organization-setup');
	});

	it('records Later on Continue when nobody has been invited', async () => {
		renderStep(Promise.resolve(team()));

		await fireEvent.click(await screen.findByRole('button', { name: /^Continue/ }));

		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe('/org/alpha/api/organization/setup/answer');
		expect(JSON.parse(String(init?.body))).toEqual({ step: 'invite', answer: 'later' });
	});

	it('records nothing on Continue once a pending invitation makes the step Done', async () => {
		renderStep(Promise.resolve(team()), facts({ pendingInvitations: ready(1) }));

		await fireEvent.click(await screen.findByRole('button', { name: /^Continue/ }));

		await waitFor(() => expect(screen.getByRole('button', { name: /^Continue/ })).toBeEnabled());
		expect(fetch).not.toHaveBeenCalled();
	});
});

// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { invalidate } from '$app/navigation';
import type { SetupFacts } from './registry';
import type { OrganizationSetup } from './state';
import SetupFlowHarness from './test-support/SetupFlowHarness.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}), goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { data: { orgName: 'Alpha Company' } } }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.mocked(invalidate).mockClear();
});

const ready = (value: number) => ({ status: 'ready', value }) as const;
const facts: SetupFacts = {
	branch: null,
	groups: ready(0),
	activeRanks: ready(14),
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
	lossWarningWindowDays: ready(90)
};
const empty: OrganizationSetup = { branch: null, answers: {}, finishedAt: null, prompts: {} };

function respond(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderWelcome() {
	render(SetupFlowHarness, {
		props: {
			source: {
				orgUrlSegment: 'alpha',
				disabledFeatures: [],
				setupState: empty,
				setupFacts: Promise.resolve(facts),
				stepKey: 'welcome',
				isOwner: true,
				navigating: false
			}
		}
	});
	return screen.getByRole('button', { name: /Groups/ });
}

it('holds Continue until a branch is saved, then refreshes setup facts', async () => {
	const fetch = vi.fn(async () => respond(200, { ...empty, branch: 'navy' }));
	vi.stubGlobal('fetch', fetch);
	const continueButton = renderWelcome();
	expect(continueButton).toBeDisabled();

	await userEvent.click(screen.getByRole('button', { name: 'Navy' }));

	expect(fetch).toHaveBeenCalledWith(
		'/org/alpha/api/organization/setup/branch',
		expect.objectContaining({ method: 'POST', body: JSON.stringify({ branch: 'navy' }) })
	);
	await waitFor(() => expect(screen.getByRole('button', { name: 'Navy' })).toHaveAttribute('aria-pressed', 'true'));
	expect(continueButton).toBeEnabled();
	expect(invalidate).toHaveBeenCalledWith('app:organization-setup');
});

it('sends Mixed or joint as the custom branch', async () => {
	const fetch = vi.fn(async () => respond(200, { ...empty, branch: 'custom' }));
	vi.stubGlobal('fetch', fetch);
	renderWelcome();

	await userEvent.click(screen.getByRole('button', { name: 'Mixed or joint' }));

	expect(fetch).toHaveBeenCalledWith(
		'/org/alpha/api/organization/setup/branch',
		expect.objectContaining({ body: JSON.stringify({ branch: 'custom' }) })
	);
});

it('keeps the step unanswered when the branch save fails', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => respond(503, { message: 'Rank catalog unavailable' }))
	);
	const continueButton = renderWelcome();

	await userEvent.click(screen.getByRole('button', { name: 'Army' }));

	expect(await screen.findByRole('alert')).toHaveTextContent('Rank catalog unavailable');
	expect(screen.getByRole('button', { name: 'Army' })).toHaveAttribute('aria-pressed', 'false');
	expect(continueButton).toBeDisabled();
	expect(invalidate).not.toHaveBeenCalled();
});

it('waits for the refreshed rank count before announcing it', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => respond(200, { ...empty, branch: 'army' }))
	);
	const source = {
		orgUrlSegment: 'alpha',
		disabledFeatures: [],
		setupState: empty,
		setupFacts: Promise.resolve(facts),
		stepKey: 'welcome' as const,
		isOwner: true,
		navigating: false
	};
	const { rerender } = render(SetupFlowHarness, { props: { source } });

	await userEvent.click(screen.getByRole('button', { name: 'Army' }));
	const status = await screen.findByRole('status');
	expect(status).not.toHaveTextContent('14');

	await rerender({
		source: {
			...source,
			setupState: { ...empty, branch: 'army' },
			setupFacts: Promise.resolve({ ...facts, activeRanks: ready(30) })
		}
	});
	await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('30'));
});

// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { SETUP_STEPS, type SetupFacts } from './registry';
import { SETUP_FACT_LABELS } from './setupFlow.svelte';
import SetupFlowHarness from './test-support/SetupFlowHarness.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn() }));

afterEach(() => cleanup());

const ready = (value: number) => ({ status: 'ready', value }) as const;

const facts: SetupFacts = {
	branch: null,
	groups: ready(3),
	activeRanks: ready(28),
	activePeople: ready(0),
	statusTypes: ready(7),
	assignmentTypes: ready(2),
	trainingTypes: { status: 'error', message: 'timeout' },
	criticalTasks: ready(0),
	evaluations: ready(0),
	onboardingTemplates: ready(0),
	events: ready(0),
	taskings: ready(0),
	members: ready(1),
	pendingInvitations: ready(0),
	lossWarningWindowDays: ready(90)
};

it('shows a failed fact source on its own step and leaves the step usable', async () => {
	render(SetupFlowHarness, {
		props: {
			source: {
				orgUrlSegment: 'alpha',
				disabledFeatures: [],
				setupState: { branch: null, answers: {}, finishedAt: null, prompts: {} },
				setupFacts: Promise.resolve(facts),
				stepKey: 'training',
				navigating: false
			}
		}
	});

	const rail = screen.getByTestId('setup-rail');
	const failed = new RegExp(SETUP_FACT_LABELS.trainingTypes);
	const training = await within(rail).findByRole('link', { name: failed });
	expect(training).toHaveAttribute('aria-current', 'step');
	expect(within(rail).getAllByRole('link', { name: failed })).toHaveLength(1);
	expect(screen.getByRole('alert')).toHaveTextContent(SETUP_FACT_LABELS.trainingTypes);
	const next = SETUP_STEPS[SETUP_STEPS.findIndex((step) => step.key === 'training') + 1];
	expect(screen.getByRole('button', { name: new RegExp(next.title) })).toBeEnabled();
});

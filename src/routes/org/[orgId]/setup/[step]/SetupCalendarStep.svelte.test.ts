// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { dailyAssignmentsStore } from '$features/calendar';
import SetupCalendarStep from './SetupCalendarStep.svelte';
import SetupStepHarness from './test-support/SetupStepHarness.svelte';
import { page } from './test-support/setupPage.svelte';
import { answerEndpoint, stepSource } from './test-support/setupSource';

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => ({ invalidate }));
vi.mock('$app/state', async () => await import('./test-support/setupPage.svelte'));
vi.mock('$features/app-shell', () => ({ getAppShellContext: () => ({ orgUrlSegment: 'alpha' }) }));
vi.mock('$features/calendar/calendarWorkspaceHydration.svelte', () => ({
	calendarWorkspaceHydrator: { hydrate: async () => {}, restrict: () => {}, reset: () => {} }
}));
vi.mock('$features/calendar/components/CalendarSettingsPage.svelte', async () => ({
	default: (await import('$lib/test-stubs/VisibleStub.svelte')).default
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	invalidate.mockClear();
});

it('holds Continue while a calendar setting saves, then stays on the step when it fails', async () => {
	page.data = { calendar: { data: Promise.resolve({ hydration: {} }) } };
	const typeSave = Promise.withResolvers<Response>();
	const answer = answerEndpoint();
	const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
		String(input).endsWith('/setup/answer') ? answer(input, init) : typeSave.promise
	);
	vi.stubGlobal('fetch', fetch);
	const navigate = vi.fn(async () => {});
	render(SetupStepHarness, { props: { source: stepSource('calendar'), navigate, step: SetupCalendarStep } });
	const next = screen.getByRole('button', { name: /Continue to/ });

	await screen.findByTestId('visible-stub');
	dailyAssignmentsStore.load([], [], 'alpha');
	void dailyAssignmentsStore.addType({ name: 'Staff Duty' } as never).catch(() => {});
	await waitFor(() => expect(next).toBeDisabled());
	await fireEvent.click(next);
	await new Promise((settle) => setTimeout(settle));

	expect(fetch.mock.calls.map(([input]) => String(input))).toEqual(['/org/alpha/api/assignment-types']);
	expect(navigate).not.toHaveBeenCalled();

	typeSave.resolve(new Response(JSON.stringify({ message: 'Assignment type name is taken' }), { status: 409 }));

	await waitFor(() => expect(next).toBeEnabled());
	expect(navigate).not.toHaveBeenCalled();
	await fireEvent.click(next);
	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/training'));
});

it('rereads the setup counts once an assignment added here is saved', async () => {
	page.data = { calendar: { data: Promise.resolve({ hydration: {} }) } };
	render(SetupStepHarness, {
		props: { source: stepSource('calendar'), navigate: vi.fn(async () => {}), step: SetupCalendarStep }
	});
	await screen.findByTestId('visible-stub');
	dailyAssignmentsStore.load([], [], 'alpha');
	await new Promise((settle) => setTimeout(settle));
	expect(invalidate).not.toHaveBeenCalled();

	dailyAssignmentsStore.load([{ id: 'cq', name: 'CQ' } as never], [], 'alpha');

	await waitFor(() => expect(invalidate).toHaveBeenCalledWith('app:organization-setup'));
});

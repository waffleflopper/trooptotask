// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import SetupCalendarStep from './SetupCalendarStep.svelte';
import SetupStepHarness from './test-support/SetupStepHarness.svelte';
import { page } from './test-support/setupPage.svelte';
import { answerEndpoint, stepSource } from './test-support/setupSource';

vi.mock('$app/state', async () => await import('./test-support/setupPage.svelte'));
vi.mock('$features/app-shell', () => ({ getAppShellContext: () => ({ orgUrlSegment: 'alpha' }) }));
vi.mock('$features/calendar/calendarWorkspaceHydration.svelte', () => ({
	calendarWorkspaceHydrator: { hydrate: async () => {}, restrict: () => {}, reset: () => {} }
}));
vi.mock('$features/calendar/components/CalendarSettingsPage.svelte', async () => ({
	default: (await import('./test-support/CalendarSettingsStub.svelte')).default
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it('holds Continue while a calendar setting saves, then stays on the step when it fails', async () => {
	page.data = { calendar: { data: Promise.resolve({ hydration: {} }) } };
	const statusSave = Promise.withResolvers<Response>();
	const answer = answerEndpoint();
	const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
		String(input).endsWith('/setup/answer') ? answer(input, init) : statusSave.promise
	);
	vi.stubGlobal('fetch', fetch);
	const navigate = vi.fn(async () => {});
	render(SetupStepHarness, { props: { source: stepSource('calendar'), navigate, step: SetupCalendarStep } });
	const next = screen.getByRole('button', { name: /Continue to/ });

	await fireEvent.click(await screen.findByRole('button', { name: 'Add status type' }));
	await fireEvent.click(next);
	await new Promise((settle) => setTimeout(settle));

	expect(fetch.mock.calls.map(([input]) => String(input))).toEqual(['/org/alpha/api/status-types']);
	expect(navigate).not.toHaveBeenCalled();

	statusSave.resolve(new Response(JSON.stringify({ message: 'Status type name is taken' }), { status: 409 }));

	await waitFor(() => expect(next).toBeEnabled());
	expect(navigate).not.toHaveBeenCalled();
	await fireEvent.click(next);
	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/training'));
});

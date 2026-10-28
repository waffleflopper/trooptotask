// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { dailyAssignmentsStore, statusTypesStore } from '$features/calendar';
import SetupCalendarStep from './SetupCalendarStep.svelte';
import SetupStepHarness from './test-support/SetupStepHarness.svelte';
import { page } from './test-support/setupPage.svelte';
import { answerEndpoint, stepSource } from './test-support/setupSource';

const { invalidate, allowed } = vi.hoisted(() => ({
	invalidate: vi.fn(async () => {}),
	allowed: new Set<string>()
}));
vi.mock('$app/navigation', () => ({ invalidate }));
vi.mock('$app/state', async () => await import('./test-support/setupPage.svelte'));
vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		orgUrlSegment: 'alpha',
		affordanceForFeatureAction: (action: { id: string }) => ({ allowed: allowed.has(action.id), visible: true })
	})
}));
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
	allowed.clear();
});

const status = (id: string, name: string, sortOrder: number) => ({
	id,
	name,
	color: '#000000',
	textColor: '#ffffff',
	shortLabel: null,
	rosterEffect: 'available' as const,
	sortOrder
});

type Picked = { statusIds: string[]; assignmentIds: string[] };

/** A Calendar configurer on a unit with the given statuses and no assignment types. */
function renderPicker(saved: ReturnType<typeof status>[], reply: (body: Picked) => unknown) {
	allowed.add('calendar.configureStatusTypes').add('calendar.configureAssignmentTypes');
	statusTypesStore.load(saved, 'alpha');
	dailyAssignmentsStore.load([], [], 'alpha');
	page.data = { calendar: { data: Promise.resolve({ hydration: {} }) } };
	const posts: unknown[] = [];
	vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input) !== '/org/alpha/api/calendar-suggestions') throw new Error(`Unexpected ${input}`);
		const body = JSON.parse(String(init?.body));
		posts.push(body);
		return Response.json(reply(body));
	});
	const navigate = vi.fn(async () => {});
	render(SetupStepHarness, { props: { source: stepSource('calendar'), navigate, step: SetupCalendarStep } });
	return { posts, navigate };
}

const created = (body: Pick<Picked, 'statusIds'>) => ({
	created: [],
	skipped: [],
	failed: [],
	statusTypes: body.statusIds.map((id, index) => status(`db-${id}`, id, index)),
	assignmentTypes: []
});

it('adds exactly the checked suggestions, then moves on', async () => {
	const { posts, navigate } = renderPicker([], created);

	await fireEvent.click(await screen.findByRole('checkbox', { name: /^Sick/ }));
	await fireEvent.click(screen.getByRole('checkbox', { name: /^Staff Duty/ }));
	await fireEvent.click(screen.getByRole('button', { name: 'Add 6 and continue' }));

	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/training'));
	expect(posts).toEqual([
		{ statusIds: ['leave', 'school', 'training-tdy', 'appointment', 'other-duty-detail', 'cq-sd'], assignmentIds: [] }
	]);
});

it('hides a suggestion the unit already has under any casing', async () => {
	renderPicker([status('s-1', ' leave ', 0)], created);

	await screen.findByRole('checkbox', { name: /^School/ });
	expect(screen.queryByRole('checkbox', { name: /^Leave/ })).toBeNull();
});

it('keeps the owner on the step with the failed rows named and rereads the saved rows', async () => {
	const { navigate } = renderPicker([], (body) => ({
		...created({ statusIds: body.statusIds.filter((id) => id !== 'sick') }),
		failed: [{ id: 'sick', name: 'Sick', message: 'Timed out' }]
	}));

	await screen.findByRole('checkbox', { name: /^Sick/ });
	await fireEvent.click(screen.getByRole('button', { name: 'Add 8 and continue' }));

	expect(await screen.findByRole('alert')).toHaveTextContent('Sick');
	expect(navigate).not.toHaveBeenCalled();
	expect(invalidate).toHaveBeenCalledWith('app:calendar-data');
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

// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import CalendarTypeSetupHost from '../test-support/CalendarTypeSetupHost.svelte';

const saved = (id: string, name: string) => ({
	id,
	name,
	color: '#16a34a',
	textColor: '#ffffff',
	shortLabel: null,
	rosterEffect: 'A' as const,
	sortOrder: 0
});
const created = { created: [], skipped: [], failed: [], statusTypes: [], assignmentTypes: [] };
const fetchMock = vi.fn();

beforeEach(() => {
	statusTypesStore.load([], 'alpha');
	fetchMock.mockReset();
	fetchMock.mockResolvedValue(Response.json(created));
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const manager = { orgUrlSegment: 'alpha', canSetUp: { status: true, assignments: true } };
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe('CalendarTypesEmptyState', () => {
	it.each([
		['status', 'status'],
		['assignments', 'assignments']
	] as const)('links a %s manager to that section of Calendar settings', (kind, section) => {
		render(CalendarTypeSetupHost, { props: { kind, setup: manager } });

		expect(screen.getByRole('link').getAttribute('href')).toBe(`/org/alpha/calendar/settings?section=${section}`);
	});

	it('offers no link to a viewer who may configure only the other kind of type', () => {
		render(CalendarTypeSetupHost, {
			props: { kind: 'assignments', setup: { orgUrlSegment: 'alpha', canSetUp: { status: true, assignments: false } } }
		});

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.getByText(/Ask someone who manages Calendar settings/)).toBeTruthy();
	});

	it('offers no link when the page set no Calendar settings access', () => {
		render(CalendarTypeSetupHost, { props: { kind: 'status' } });

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.getByText(/Ask someone who manages Calendar settings/)).toBeTruthy();
	});

	it('offers the starter statuses to a manager, all checked, and adds the checked ones', async () => {
		render(CalendarTypeSetupHost, { props: { kind: 'status', setup: manager } });

		const boxes = screen.getAllByRole('checkbox');
		expect(boxes.every((box) => box.getAttribute('aria-checked') === 'true')).toBe(true);
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Sick' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Add \d/ }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock.mock.calls[0][0]).toBe('/org/alpha/api/calendar-suggestions');
		expect(sentBody()).toEqual({
			statusIds: ['leave', 'school', 'training-tdy', 'appointment', 'other-duty-detail', 'cq-sd'],
			assignmentIds: []
		});
	});

	it('offers Staff Duty on the assignments empty state and adds it', async () => {
		render(CalendarTypeSetupHost, { props: { kind: 'assignments', setup: manager } });

		await fireEvent.click(screen.getByRole('button', { name: /^Add \d/ }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(sentBody()).toEqual({ statusIds: [], assignmentIds: ['staff-duty'] });
	});

	it('lists the saved statuses without a reload and stops offering them', async () => {
		fetchMock.mockResolvedValue(
			Response.json({ ...created, statusTypes: [saved('s1', 'Leave'), saved('s2', 'School')] })
		);
		render(CalendarTypeSetupHost, { props: { kind: 'status', setup: manager } });

		await fireEvent.click(screen.getByRole('button', { name: /^Add \d/ }));

		await waitFor(() => expect(statusTypesStore.items.map(({ name }) => name)).toEqual(['Leave', 'School']));
		expect(screen.queryByRole('checkbox', { name: 'Leave' })).toBeNull();
		expect(screen.getByRole('checkbox', { name: 'Sick' })).toBeTruthy();
	});

	it('does not offer a starter status the Organization already has by name', () => {
		statusTypesStore.load(
			[
				{
					id: 's1',
					name: ' leave ',
					color: '#000000',
					textColor: '#ffffff',
					shortLabel: null,
					rosterEffect: 'A',
					sortOrder: 0
				}
			],
			'alpha'
		);
		render(CalendarTypeSetupHost, { props: { kind: 'status', setup: manager } });

		expect(screen.queryByRole('checkbox', { name: 'Leave' })).toBeNull();
		expect(screen.getByRole('checkbox', { name: 'School' })).toBeTruthy();
	});

	it('sends one request while a save is pending', async () => {
		let finish: (response: Response) => void = () => {};
		fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
		render(CalendarTypeSetupHost, { props: { kind: 'status', setup: manager } });

		const add = screen.getByRole('button', { name: /^Add \d/ });
		await fireEvent.click(add);
		await fireEvent.click(add);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect((add as HTMLButtonElement).disabled).toBe(true);
		finish(Response.json(created));
		await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
	});

	it('shows the server failure and lets the manager retry', async () => {
		fetchMock.mockResolvedValue(Response.json({ message: 'Calendar is unavailable' }, { status: 500 }));
		render(CalendarTypeSetupHost, { props: { kind: 'status', setup: manager } });

		await fireEvent.click(screen.getByRole('button', { name: /^Add \d/ }));

		expect((await screen.findByRole('alert')).textContent).toContain('Calendar is unavailable');
		expect((screen.getByRole('button', { name: /^Add \d/ }) as HTMLButtonElement).disabled).toBe(false);
		expect(statusTypesStore.items).toEqual([]);
	});

	it('names the starter types a partial save could not create after the offer closes', async () => {
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
		const leave = {
			id: 's1',
			name: 'Leave',
			color: '#48bb78',
			textColor: '#ffffff',
			shortLabel: null,
			rosterEffect: 'A',
			sortOrder: 0
		};
		fetchMock.mockResolvedValue(
			Response.json({ ...created, statusTypes: [leave], failed: [{ id: 'sick', name: 'Sick', message: 'Try again.' }] })
		);
		render(CalendarTypeSetupHost, { props: { kind: 'status', setup: manager } });

		await fireEvent.click(screen.getByRole('button', { name: /^Add \d/ }));

		await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining('Sick')));
		expect(statusTypesStore.items.map(({ name }) => name)).toEqual(['Leave']);
		error.mockRestore();
	});

	it('keeps the saved starter types when the picker closes during the save', async () => {
		let reply: (response: Response) => void = () => {};
		fetchMock.mockReturnValue(new Promise<Response>((resolve) => (reply = resolve)));
		const { unmount } = render(CalendarTypeSetupHost, { props: { kind: 'status', setup: manager } });

		await fireEvent.click(screen.getByRole('button', { name: /^Add \d/ }));
		unmount();
		reply(
			Response.json({
				...created,
				statusTypes: [
					{
						id: 's1',
						name: 'Leave',
						color: '#48bb78',
						textColor: '#ffffff',
						shortLabel: null,
						rosterEffect: 'A',
						sortOrder: 0
					}
				]
			})
		);

		await waitFor(() => expect(statusTypesStore.items.map(({ name }) => name)).toEqual(['Leave']));
	});

	it('offers no starter types to a viewer who may configure only the other kind', () => {
		render(CalendarTypeSetupHost, {
			props: { kind: 'status', setup: { orgUrlSegment: 'alpha', canSetUp: { status: false, assignments: true } } }
		});

		expect(screen.queryByRole('checkbox')).toBeNull();
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByText(/Ask someone who manages Calendar settings/)).toBeTruthy();
	});
});

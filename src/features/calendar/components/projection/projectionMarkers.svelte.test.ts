// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import SuspenseLaneCell from './SuspenseLaneCell.svelte';
import EventsLaneSegment from './EventsLaneSegment.svelte';
import CommitmentRun from './CommitmentRun.svelte';
import ProjectionLaneStatus from './ProjectionLaneStatus.svelte';
import ProjectionCardsHarness from '../../test-support/ProjectionCardsHarness.svelte';
import type { Component } from 'svelte';
import type { EventsLaneSegment as EventsLaneSegmentValue } from './EventsLaneSegment.svelte';
import type { CommitmentSegment } from '$features/calendar/projection/projectionCommitments';

afterEach(cleanup);

const marker = (key: string) => ({
	key,
	title: `Tasking ${key}`,
	detail: 'Due',
	href: `/taskings/${key}`,
	target: { kind: 'tasking' as const, id: key },
	label: `Suspense: Tasking ${key}`
});
const day = (keys: string[], overdue = false) => ({ dateLabel: '10 May 2026', markers: keys.map(marker), overdue });

function withCards<P extends Record<string, unknown>>(component: Component<P>, props: P) {
	const open = vi.fn();
	render(ProjectionCardsHarness<P>, { props: { open, marker: component, props } });
	return open;
}

describe('SuspenseLaneCell', () => {
	it('links a lone suspense to its Tasking', () => {
		render(SuspenseLaneCell, { value: day(['a']) });

		expect(screen.getByRole('link', { name: 'Suspense: Tasking a' }).getAttribute('href')).toBe('/taskings/a');
	});

	it('opens the quick card for a lone suspense on the Calendar instead of leaving it', async () => {
		const open = withCards(SuspenseLaneCell, { value: day(['a']) });

		const link = screen.getByRole('link', { name: 'Suspense: Tasking a' });
		const followed = await fireEvent.click(link);

		expect(followed).toBe(false);
		expect(open).toHaveBeenCalledWith({ kind: 'one', target: { kind: 'tasking', id: 'a' } }, link);
	});

	it('keeps a modified click a plain link for a new tab', async () => {
		const open = withCards(SuspenseLaneCell, { value: day(['a']) });

		await fireEvent.click(screen.getByRole('link'), { ctrlKey: true });

		expect(open).not.toHaveBeenCalled();
	});

	it('offers one control for a day with several suspenses, which opens their list', async () => {
		const open = withCards(SuspenseLaneCell, { value: day(['a', 'b']) });

		expect(screen.queryByRole('link')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /2 suspenses due/ }));

		expect(open).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'list',
				choices: [expect.objectContaining({ key: 'a' }), expect.objectContaining({ key: 'b' })]
			}),
			expect.any(HTMLElement)
		);
	});

	it('lists several suspenses in a popover away from the Calendar', async () => {
		render(SuspenseLaneCell, { value: day(['a', 'b']) });

		await fireEvent.click(screen.getByRole('button', { name: /2 suspenses due/ }));

		expect(
			within(await screen.findByRole('list'))
				.getAllByRole('link')
				.map((link) => link.getAttribute('href'))
		).toEqual(['/taskings/a', '/taskings/b']);
	});

	it('names an overdue day as overdue', () => {
		render(SuspenseLaneCell, { value: day(['a', 'b'], true) });

		expect(screen.getByRole('button', { name: /2 overdue suspenses/ })).toBeTruthy();
	});

	it('draws nothing on a day with no suspense', () => {
		const { container } = render(SuspenseLaneCell, { value: day([]) });

		expect(container.textContent).toBe('');
		expect(container.querySelector('a, button, svg')).toBeNull();
	});
});

describe('EventsLaneSegment', () => {
	const choice = (key: string) => ({
		key,
		title: `Event ${key}`,
		detail: '5 May',
		href: `/events/${key}`,
		target: { kind: 'event' as const, id: key }
	});
	const segment = (overrides: Partial<EventsLaneSegmentValue> = {}): EventsLaneSegmentValue => ({
		title: 'Event a',
		href: '/events/a',
		target: { kind: 'event', id: 'a' },
		label: 'Event a, 4 May 2026 to 6 May 2026, we host',
		cancelled: false,
		hosted: true,
		taskings: 0,
		row: 0,
		continuesBefore: false,
		continuesAfter: false,
		days: 3,
		room: 0,
		self: choice('a'),
		others: [],
		...overrides
	});

	it('links an Event to its detail and names it with its dates', () => {
		render(EventsLaneSegment, { value: segment() });

		expect(screen.getByRole('link', { name: 'Event a, 4 May 2026 to 6 May 2026, we host' }).getAttribute('href')).toBe(
			'/events/a'
		);
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('names how many Taskings the Event carries', () => {
		render(EventsLaneSegment, { value: segment({ taskings: 6 }) });

		expect(screen.getByRole('link', { name: /, 6 Taskings$/ })).toBeTruthy();
	});

	it('opens the quick card for the Event on the Calendar', async () => {
		const open = withCards(EventsLaneSegment, { value: segment() });

		await fireEvent.click(screen.getByRole('link'));

		expect(open).toHaveBeenCalledWith({ kind: 'one', target: { kind: 'event', id: 'a' } }, expect.any(HTMLElement));
	});

	it('offers every Event of the days from +N', async () => {
		const open = withCards(EventsLaneSegment, { value: segment({ row: 1, others: [choice('b'), choice('c')] }) });

		await fireEvent.click(screen.getByRole('button', { name: /2 more Events/ }));

		expect(open.mock.calls[0][0].choices.map((item: { key: string }) => item.key)).toEqual(['a', 'b', 'c']);
	});
});

describe('CommitmentRun', () => {
	const edges = { start: 3, end: 5, continuesBefore: false, continuesAfter: false };
	const one = (conflicts: boolean): CommitmentSegment => ({
		kind: 'tasking',
		conflicts,
		...edges,
		label: 'Tasking: Submit roster',
		href: '/taskings/t1',
		target: { kind: 'tasking', id: 't1', personnelId: 'p1' }
	});

	it('links a single commitment to its Tasking', () => {
		render(CommitmentRun, { segment: one(false) });

		expect(screen.getByRole('link', { name: 'Tasking: Submit roster' }).getAttribute('href')).toBe('/taskings/t1');
	});

	it('opens the card for the Tasking from the row the commitment is on', async () => {
		const open = withCards(CommitmentRun, { segment: one(false) });

		await fireEvent.click(screen.getByRole('link'));

		expect(open).toHaveBeenCalledWith(
			{ kind: 'one', target: { kind: 'tasking', id: 't1', personnelId: 'p1' } },
			expect.any(HTMLElement)
		);
	});

	it('marks only a conflicting commitment with the warning', () => {
		const { container, unmount } = render(CommitmentRun, { segment: one(false) });
		expect(container.querySelector('[data-slot="commitment-conflict"]')).toBeNull();
		unmount();

		const conflicting = render(CommitmentRun, { segment: one(true) });
		expect(conflicting.container.querySelector('[data-slot="commitment-conflict"]')).not.toBeNull();
	});

	it('opens every overlapping Tasking from one control', async () => {
		const open = withCards(CommitmentRun, {
			segment: {
				kind: 'taskings',
				conflicts: false,
				...edges,
				label: '2 Taskings: A, B',
				heading: 'Tasking commitments',
				choices: [
					{ key: 'a', title: 'A', detail: 'Executes', href: '/taskings/a', target: { kind: 'tasking', id: 'a' } },
					{ key: 'b', title: 'B', detail: 'Executes', href: '/taskings/b', target: { kind: 'tasking', id: 'b' } }
				]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '2 Taskings: A, B' }));

		expect(open.mock.calls[0][0]).toMatchObject({ kind: 'list', heading: 'Tasking commitments' });
	});
});

describe('ProjectionLaneStatus', () => {
	it('offers a retry that names the region and runs it', async () => {
		const retry = vi.fn();
		render(ProjectionLaneStatus, { value: { kind: 'error', what: 'Events', retry } });

		await fireEvent.click(screen.getByRole('button', { name: 'Retry loading Events' }));

		expect(retry).toHaveBeenCalledOnce();
	});

	it('offers no retry when the lane has none', () => {
		render(ProjectionLaneStatus, { value: { kind: 'error', what: 'Suspenses' } });

		expect(screen.queryByRole('button')).toBeNull();
	});

	it('tells assistive technology what is loading', () => {
		render(ProjectionLaneStatus, { value: { kind: 'loading', what: 'Events' } });

		expect(screen.getByText(/Loading Events/)).toBeTruthy();
	});
});

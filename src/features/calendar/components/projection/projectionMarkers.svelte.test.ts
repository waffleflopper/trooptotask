// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import SuspenseLaneCell from './SuspenseLaneCell.svelte';
import EventsLaneSegment from './EventsLaneSegment.svelte';
import CommitmentRun from './CommitmentRun.svelte';
import ProjectionLaneStatus from './ProjectionLaneStatus.svelte';

afterEach(cleanup);

const marker = (key: string) => ({
	key,
	title: `Tasking ${key}`,
	detail: 'Due',
	href: `/taskings/${key}`,
	label: `Suspense: Tasking ${key}`
});

describe('SuspenseLaneCell', () => {
	it('links a lone suspense to its Tasking and offers no list', () => {
		render(SuspenseLaneCell, { value: { dateLabel: '10 May 2026', markers: [marker('a')], compact: false } });

		expect(screen.getByRole('link', { name: 'Suspense: Tasking a' }).getAttribute('href')).toBe('/taskings/a');
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('keeps the first suspense a link and opens the full list from +N', async () => {
		render(SuspenseLaneCell, {
			value: { dateLabel: '10 May 2026', markers: [marker('a'), marker('b'), marker('c')], compact: false }
		});

		expect(screen.getAllByRole('link')).toHaveLength(1);
		await fireEvent.click(screen.getByRole('button', { name: /2 more/ }));

		const list = await screen.findByRole('list');
		expect(
			within(list)
				.getAllByRole('link')
				.map((link) => link.getAttribute('href'))
		).toEqual(['/taskings/a', '/taskings/b', '/taskings/c']);
	});

	it('gives a ten pixel day one control that opens the list when several are due', async () => {
		render(SuspenseLaneCell, {
			value: { dateLabel: '10 May 2026', markers: [marker('a'), marker('b')], compact: true }
		});

		expect(screen.queryByRole('link')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /2 suspenses due/ }));

		expect(within(await screen.findByRole('list')).getAllByRole('link')).toHaveLength(2);
	});

	it('draws nothing on a day with no suspense', () => {
		const { container } = render(SuspenseLaneCell, {
			value: { dateLabel: '10 May 2026', markers: [], compact: false }
		});

		expect(container.textContent).toBe('');
		expect(screen.queryByRole('link')).toBeNull();
	});
});

describe('EventsLaneSegment', () => {
	const item = (key: string) => ({ key, title: `Event ${key}`, detail: '5 May', href: `/events/${key}` });
	const segment = (days: number, others: string[]) => ({
		title: 'Event a',
		href: '/events/a',
		label: 'Event a, 4 May 2026 to 6 May 2026',
		cancelled: false,
		continuesBefore: false,
		continuesAfter: false,
		days,
		room: 0,
		self: item('a'),
		others: others.map(item)
	});

	it('links an Event to its detail and names it with its dates', () => {
		render(EventsLaneSegment, { value: segment(3, []) });

		expect(screen.getByRole('link', { name: 'Event a, 4 May 2026 to 6 May 2026' }).getAttribute('href')).toBe(
			'/events/a'
		);
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('keeps the visible Event a link and opens every Event of the days from +N', async () => {
		render(EventsLaneSegment, { value: segment(3, ['b', 'c']) });

		expect(screen.getAllByRole('link')).toHaveLength(1);
		await fireEvent.click(screen.getByRole('button', { name: /2 more Events/ }));

		const list = await screen.findByRole('list');
		expect(
			within(list)
				.getAllByRole('link')
				.map((link) => link.getAttribute('href'))
		).toEqual(['/events/a', '/events/b', '/events/c']);
	});

	it('offers one control on a single narrow day, which opens the list', async () => {
		render(EventsLaneSegment, { value: segment(1, ['b']) });

		expect(screen.queryByRole('link')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /2 Events/ }));

		expect(within(await screen.findByRole('list')).getAllByRole('link')).toHaveLength(2);
	});
});

describe('CommitmentRun', () => {
	const edges = { start: 3, end: 5, continuesBefore: false, continuesAfter: false };

	it('links a single commitment to its Tasking', () => {
		render(CommitmentRun, {
			segment: { kind: 'tasking', conflicts: false, ...edges, label: 'Tasking: Submit roster', href: '/taskings/t1' }
		});

		expect(screen.getByRole('link', { name: 'Tasking: Submit roster' }).getAttribute('href')).toBe('/taskings/t1');
	});

	it('opens every overlapping Tasking from one control', async () => {
		render(CommitmentRun, {
			segment: {
				kind: 'taskings',
				conflicts: false,
				...edges,
				label: '2 Taskings: A, B',
				heading: 'Tasking commitments',
				items: [
					{ key: 'a', title: 'A', detail: 'Executes', href: '/taskings/a' },
					{ key: 'b', title: 'B', detail: 'Executes', href: '/taskings/b' }
				]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '2 Taskings: A, B' }));

		expect(within(await screen.findByRole('list')).getAllByRole('link')).toHaveLength(2);
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

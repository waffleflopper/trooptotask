// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { EventCard, TaskingCard } from '$features/calendar/projection/projectionCardModel';
import type { ProjectionCardRequest } from '$features/calendar/projection/projectionCards';
import ProjectionCard from './ProjectionCard.svelte';

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

const tasking = (overrides: Partial<TaskingCard> = {}): TaskingCard => ({
	kind: 'tasking',
	id: 't1',
	title: 'Litter team',
	status: 'open',
	suspenseOn: '2026-05-10',
	responsibility: { kind: 'organization' },
	picked: 1,
	required: 2,
	conflicts: 0,
	conflictingPersonId: null,
	next: 'start',
	href: '/taskings/t1',
	...overrides
});

const event: EventCard = {
	kind: 'event',
	id: 'e1',
	title: 'Field exercise',
	startsOn: '2026-05-04',
	endsOn: '2026-05-06',
	cancelled: false,
	host: null,
	taskings: null,
	href: '/events/e1',
	addTaskingHref: '/events/e1?addTasking'
};

function open(
	request: ProjectionCardRequest,
	card: EventCard | TaskingCard | null,
	overrides: Partial<{
		canAddTasking: boolean;
		canManage: boolean;
		onStatus: () => Promise<'done' | 'failed' | 'abandoned'>;
	}> = {}
) {
	const anchor = document.createElement('button');
	document.body.append(anchor);
	anchor.focus();
	const onClose = vi.fn();
	const onAssign = vi.fn();
	const onStatus = vi.fn(overrides.onStatus ?? (async () => 'done' as const));
	render(ProjectionCard, {
		props: {
			request,
			anchor,
			today: '2026-05-08',
			cardFor: () => card,
			groupName: () => 'Alpha',
			personName: () => 'SGT Okafor',
			canAddTasking: overrides.canAddTasking ?? false,
			canManage: () => overrides.canManage ?? false,
			onStatus,
			onAssign,
			onClose
		}
	});
	return { anchor, onClose, onAssign, onStatus };
}

describe('ProjectionCard', () => {
	it('opens an Event and offers Add tasking only to a reader who may add one', async () => {
		open({ kind: 'one', target: { kind: 'event', id: 'e1' } }, event, { canAddTasking: true });

		const card = await screen.findByRole('dialog', { name: 'Field exercise' });
		expect(within(card).getByRole('link', { name: 'Open event' }).getAttribute('href')).toBe('/events/e1');
		expect(within(card).getByRole('link', { name: 'Add tasking' }).getAttribute('href')).toBe('/events/e1?addTasking');
	});

	it('keeps a reader who cannot manage the Tasking to Open tasking', async () => {
		open({ kind: 'one', target: { kind: 'tasking', id: 't1' } }, tasking());

		const card = await screen.findByRole('dialog', { name: 'Litter team' });
		expect(
			within(card)
				.getAllByRole('link')
				.map((link) => link.getAttribute('href'))
		).toEqual(['/taskings/t1']);
		expect(within(card).queryByRole('button')).toBeNull();
	});

	it('runs the next status step and hands Assign people to the page', async () => {
		const { onStatus, onAssign } = open({ kind: 'one', target: { kind: 'tasking', id: 't1' } }, tasking(), {
			canManage: true
		});
		const card = await screen.findByRole('dialog', { name: 'Litter team' });

		await fireEvent.click(within(card).getByRole('button', { name: 'Start' }));
		await fireEvent.click(within(card).getByRole('button', { name: 'Assign people' }));

		expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'start');
		expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
	});

	it('says so when the status change fails', async () => {
		open({ kind: 'one', target: { kind: 'tasking', id: 't1' } }, tasking(), {
			canManage: true,
			onStatus: async () => 'failed'
		});
		const card = await screen.findByRole('dialog', { name: 'Litter team' });

		await fireEvent.click(within(card).getByRole('button', { name: 'Start' }));

		expect(await within(card).findByRole('alert')).toBeTruthy();
	});

	it('names the Person whose commitment clashes', async () => {
		open(
			{ kind: 'one', target: { kind: 'tasking', id: 't1', personnelId: 'p1' } },
			tasking({ conflicts: 1, conflictingPersonId: 'p1' })
		);

		const card = await screen.findByRole('dialog', { name: 'Litter team' });
		expect(within(card).getByText(/SGT Okafor/)).toBeTruthy();
	});

	it('lets the reader choose one of several, then shows its card', async () => {
		open(
			{
				kind: 'list',
				heading: '2 Events',
				choices: [
					{
						key: 'e1',
						title: 'Field exercise',
						detail: '4 May',
						href: '/events/e1',
						target: { kind: 'event', id: 'e1' }
					},
					{ key: 'e2', title: 'Range day', detail: '5 May', href: '/events/e2', target: { kind: 'event', id: 'e2' } }
				]
			},
			event
		);

		await fireEvent.click(await screen.findByRole('button', { name: /Field exercise/ }));

		expect(await screen.findByRole('dialog', { name: 'Field exercise' })).toBeTruthy();
	});

	it('closes on Escape', async () => {
		const { onClose } = open({ kind: 'one', target: { kind: 'event', id: 'e1' } }, event);
		const card = await screen.findByRole('dialog', { name: 'Field exercise' });

		await waitFor(() => expect(card.contains(document.activeElement)).toBe(true));
		await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

		expect(onClose).toHaveBeenCalledOnce();
	});
});

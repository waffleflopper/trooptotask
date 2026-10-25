// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import FeedbackThread from './FeedbackThread.svelte';

afterEach(cleanup);

it('names each reply by its side of the thread, in the supplied chronological order', () => {
	render(FeedbackThread, {
		props: {
			replies: [
				{
					id: 'first',
					feedbackId: 'thread',
					author: 'operator',
					body: 'Which unit were you in?',
					sentBy: 'operator',
					sentAt: '2026-10-23T04:00:00Z'
				},
				{
					id: 'second',
					feedbackId: 'thread',
					author: 'reporter',
					body: 'Bravo Company.',
					sentBy: 'reporter',
					sentAt: '2026-10-24T04:00:00Z'
				}
			],
			labels: { operator: 'TroopToTask', reporter: 'You' },
			formatSent: (value: string) => value
		}
	});
	const items = within(screen.getByRole('list', { name: 'Replies' })).getAllByRole('listitem');
	expect(within(items[0]).getByText('TroopToTask')).toBeTruthy();
	expect(within(items[0]).getByText('Which unit were you in?')).toBeTruthy();
	expect(within(items[1]).getByText('You')).toBeTruthy();
	expect(within(items[1]).getByText('Bravo Company.')).toBeTruthy();
});

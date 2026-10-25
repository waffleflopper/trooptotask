// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import FeedbackThread from './FeedbackThread.svelte';

afterEach(cleanup);

it('keeps the complete saved reply bodies in the supplied chronological order', () => {
	render(FeedbackThread, {
		props: {
			replies: [
				{
					id: 'first',
					feedbackId: 'thread',
					author: 'operator',
					body: 'We can reproduce this.',
					sentBy: 'operator',
					sentAt: '2026-10-23T04:00:00Z'
				},
				{
					id: 'second',
					feedbackId: 'thread',
					author: 'operator',
					body: 'Fixed in the next release.',
					sentBy: 'operator',
					sentAt: '2026-10-24T04:00:00Z'
				}
			],
			from: 'TroopToTask',
			formatSent: (value: string) => value
		}
	});
	const items = within(screen.getByRole('list', { name: 'Replies' })).getAllByRole('listitem');
	expect(within(items[0]).getByText('We can reproduce this.')).toBeTruthy();
	expect(within(items[1]).getByText('Fixed in the next release.')).toBeTruthy();
});

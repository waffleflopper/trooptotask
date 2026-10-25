// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReporterFeedback } from '$features/feedback/contracts';
import Page from './+page.svelte';

afterEach(cleanup);

const feedback = (overrides: Partial<ReporterFeedback> = {}): ReporterFeedback => ({
	id: '50000000-0000-4000-8000-000000186911',
	category: 'bug',
	message: 'Leave that crosses into November will not save',
	pageUrl: null,
	status: 'reviewed',
	createdAt: '2026-10-23T02:40:00Z',
	replies: [],
	...overrides
});

describe('reporter feedback thread', () => {
	it('shows what was sent and every reply in the order given', () => {
		render(Page, {
			props: {
				data: {
					feedback: feedback({
						replies: [
							{
								id: 'r1',
								feedbackId: 'x',
								body: 'We can reproduce this.',
								sentBy: 'op',
								sentAt: '2026-10-23T04:00:00Z'
							},
							{
								id: 'r2',
								feedbackId: 'x',
								body: 'Fixed in the next release.',
								sentBy: 'op',
								sentAt: '2026-10-24T04:00:00Z'
							}
						]
					})
				}
			} as never
		});

		expect(screen.getByText('Leave that crosses into November will not save')).toBeTruthy();
		const thread = screen.getByRole('list', { name: 'Replies' });
		expect(
			within(thread)
				.getAllByRole('listitem')
				.map((item) => item.querySelector('p:last-child')?.textContent)
		).toEqual(['We can reproduce this.', 'Fixed in the next release.']);
	});

	it('shows no replies and offers the way back to the app', () => {
		render(Page, { props: { data: { feedback: feedback() } } as never });

		expect(screen.queryByRole('list', { name: 'Replies' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Back to the app' }).getAttribute('href')).toBe('/dashboard');
	});
});

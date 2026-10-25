// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReporterFeedbackSummary } from '$features/feedback/contracts';
import Page from './+page.svelte';

afterEach(cleanup);

const item = (overrides: Partial<ReporterFeedbackSummary>): ReporterFeedbackSummary => ({
	id: '50000000-0000-4000-8000-000000186911',
	category: 'bug',
	message: 'Calendar problem\nSecond line',
	status: 'reviewed',
	createdAt: '2026-10-23T02:40:00Z',
	replyCount: 2,
	...overrides
});

describe('reporter feedback list', () => {
	it('links each item to its own thread and shows how many replies it has', () => {
		render(Page, { props: { data: { feedback: [item({})] } } as never });

		const link = screen.getByRole('link', { name: /Calendar problem/ });
		expect(link.getAttribute('href')).toBe('/feedback/50000000-0000-4000-8000-000000186911');
		expect(link.textContent).toContain('2 replies');
		expect(link.textContent).not.toContain('Second line');
	});

	it('shows no list for an account that has sent nothing', () => {
		render(Page, { props: { data: { feedback: [] } } as never });

		expect(screen.queryByRole('list')).toBeNull();
		expect(screen.getByRole('link', { name: 'Back to the app' })).toBeTruthy();
	});
});

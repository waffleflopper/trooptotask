// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventLoadFailed from './EventLoadFailed.svelte';

const current = vi.hoisted(() => ({
	url: new URL('https://app.test/org/a/calendar/events/e1'),
	state: {} as Record<string, unknown>
}));
vi.mock('$app/state', () => ({ page: current }));

const { invalidate, replaceState } = vi.hoisted(() => ({
	invalidate: vi.fn(async () => {
		current.state = {};
	}),
	replaceState: vi.fn((_url: string, state: Record<string, unknown>) => {
		current.state = state;
	})
}));
vi.mock('$app/navigation', () => ({ invalidate, replaceState }));

const review = {
	eventDateReview: {
		before: { startsOn: '2026-10-19', endsOn: '2026-10-23' },
		after: { startsOn: '2026-10-20', endsOn: '2026-10-24' }
	}
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	current.url = new URL('https://app.test/org/a/calendar/events/e1');
});

describe('Event load retry', () => {
	it('keeps an open date review after a successful retry', async () => {
		current.state = review;
		render(EventLoadFailed, { title: 'Taskings to review could not be loaded' });

		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await vi.waitFor(() => expect(current.state).toEqual(review));
	});

	it('leaves the page state alone when the user navigated away during the retry', async () => {
		current.state = review;
		invalidate.mockImplementationOnce(async () => {
			current.url = new URL('https://app.test/org/a/calendar/taskings');
			current.state = {};
		});
		render(EventLoadFailed, { title: 'Taskings to review could not be loaded' });

		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await vi.waitFor(() => expect(invalidate).toHaveBeenCalled());
		expect(current.state).toEqual({});
	});
});

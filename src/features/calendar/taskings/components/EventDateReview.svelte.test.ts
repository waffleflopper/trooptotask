// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEventsPageAccess } from '../../contracts';
import EventDateReview from './EventDateReview.svelte';

const current = vi.hoisted(() => ({
	url: new URL('https://app.test/org/a/calendar/events/e1'),
	state: {} as Record<string, unknown>
}));
vi.mock('$app/state', () => ({ page: current }));

const reloads = vi.hoisted(() => ({ finish: () => {} }));
const { invalidate, replaceState } = vi.hoisted(() => ({
	invalidate: vi.fn(
		() =>
			new Promise<void>((resolve) => {
				reloads.finish = () => {
					current.state = {};
					resolve();
				};
			})
	),
	replaceState: vi.fn((_url: string, state: Record<string, unknown>) => {
		current.state = state;
	})
}));
vi.mock('$app/navigation', () => ({ invalidate, replaceState }));

const org: CalendarEventsPageAccess = {
	orgId: 'org-a',
	orgUrlSegment: 'org-a',
	orgName: 'C Co',
	userId: '00000000-0000-4000-8000-000000000003',
	affordanceForFeatureAction: () => ({ allowed: false })
};
const before = { startsOn: '2026-10-19', endsOn: '2026-10-23' };
const after = { startsOn: '2026-10-20', endsOn: '2026-10-24' };
const review = { eventDateReview: { before, after } };

function showFailedReview() {
	current.state = review;
	const onDismiss = vi.fn(() => {
		current.state = { ...current.state, eventDateReview: undefined };
	});
	render(EventDateReview, { org, taskings: Promise.resolve({ status: 'failed' } as const), before, after, onDismiss });
	return onDismiss;
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	current.url = new URL('https://app.test/org/a/calendar/events/e1');
});

describe('Event date review retry', () => {
	it('keeps the review open after a retry reloads the Taskings', async () => {
		showFailedReview();

		await fireEvent.click(await screen.findByRole('button', { name: /retry/i }));
		reloads.finish();

		await vi.waitFor(() => expect(current.state).toEqual(review));
	});

	it('leaves the review closed when it was dismissed while the retry ran', async () => {
		showFailedReview();

		await fireEvent.click(await screen.findByRole('button', { name: /retry/i }));
		await fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
		reloads.finish();

		await vi.waitFor(() => expect(invalidate).toHaveBeenCalled());
		await Promise.resolve();
		expect(current.state.eventDateReview).toBeUndefined();
	});

	it('leaves the page state alone when the user navigated away during the retry', async () => {
		showFailedReview();

		await fireEvent.click(await screen.findByRole('button', { name: /retry/i }));
		current.url = new URL('https://app.test/org/a/calendar/taskings');
		reloads.finish();

		await vi.waitFor(() => expect(invalidate).toHaveBeenCalled());
		await Promise.resolve();
		expect(current.state).toEqual({});
	});
});

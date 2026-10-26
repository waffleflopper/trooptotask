import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadCalendarEvents, setEventPageState } from './eventPageState';

const current = vi.hoisted(() => ({
	url: new URL('https://app.test/org/a/calendar/events/e1'),
	state: {} as Record<string, unknown>
}));
vi.mock('$app/state', () => ({ page: current }));

const reloads = vi.hoisted(() => ({ finish: () => {} }));
vi.mock('$app/navigation', () => ({
	invalidate: () =>
		new Promise<void>((resolve) => {
			reloads.finish = () => {
				current.state = {};
				resolve();
			};
		}),
	replaceState: (_url: string, state: Record<string, unknown>) => {
		current.state = state;
	}
}));

const review = {
	eventDateReview: {
		before: { startsOn: '2026-10-19', endsOn: '2026-10-23' },
		after: { startsOn: '2026-10-20', endsOn: '2026-10-24' }
	}
};

afterEach(() => {
	current.url = new URL('https://app.test/org/a/calendar/events/e1');
});

describe('reloadCalendarEvents', () => {
	it('keeps the open date review through the reload', async () => {
		current.state = review;

		const reload = reloadCalendarEvents();
		reloads.finish();
		await reload;

		expect(current.state).toEqual(review);
	});

	it('keeps a review dismissed while the reload ran closed', async () => {
		current.state = review;

		const reload = reloadCalendarEvents();
		setEventPageState({ eventDateReview: undefined });
		reloads.finish();
		await reload;

		expect(current.state).toEqual({});
	});

	it('leaves the next page alone when the reader navigated during the reload', async () => {
		current.state = review;

		const reload = reloadCalendarEvents();
		current.url = new URL('https://app.test/org/a/calendar/taskings');
		reloads.finish();
		await reload;

		expect(current.state).toEqual({});
	});
});

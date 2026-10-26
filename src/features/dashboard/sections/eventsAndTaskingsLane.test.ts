import { describe, expect, it, vi } from 'vitest';
import type { DashboardTaskingsState } from '../contracts';
import type { DashboardInputs } from './dashboardInputs';
import { eventsAndTaskingsLane } from './eventsAndTaskingsLane';

function inputs(taskings: DashboardTaskingsState): DashboardInputs {
	return { page: { orgId: 'org-1', taskings } } as unknown as DashboardInputs;
}

const event = (id: string, overrides: { hasWork?: boolean; cancelled?: boolean } = {}) => ({
	id,
	title: `Event ${id}`,
	startsOn: '2026-10-27',
	endsOn: '2026-10-29',
	cancelled: false,
	hasWork: false,
	host: null,
	...overrides
});

describe('eventsAndTaskingsLane', () => {
	it('marks Events strong with work in scope, quiet for awareness and cancelled over either, and suspenses as points', () => {
		const read = eventsAndTaskingsLane.read(
			inputs({
				status: 'ready',
				attention: { rows: [], total: 0, onTrack: [] },
				forecast: {
					events: [
						event('e-work', { hasWork: true }),
						event('e-aware'),
						event('e-off', { hasWork: true, cancelled: true })
					],
					suspenses: [{ taskingId: 't-1', title: 'Names to the 1SG', suspenseOn: '2026-10-28', status: 'open' }]
				}
			})
		);

		expect(read?.state === 'ready' && read.marks.map(({ label: _label, detail: _detail, ...mark }) => mark)).toEqual([
			{
				kind: 'span',
				id: 'event:e-work',
				start: '2026-10-27',
				end: '2026-10-29',
				title: 'Event e-work',
				href: '/org/org-1/calendar/events/e-work',
				emphasis: 'strong'
			},
			{
				kind: 'span',
				id: 'event:e-aware',
				start: '2026-10-27',
				end: '2026-10-29',
				title: 'Event e-aware',
				href: '/org/org-1/calendar/events/e-aware',
				emphasis: 'quiet'
			},
			{
				kind: 'span',
				id: 'event:e-off',
				start: '2026-10-27',
				end: '2026-10-29',
				title: 'Event e-off',
				href: '/org/org-1/calendar/events/e-off',
				emphasis: 'cancelled'
			},
			{
				kind: 'point',
				id: 'suspense:t-1',
				date: '2026-10-28',
				title: 'Names to the 1SG',
				href: '/org/org-1/calendar/taskings/t-1'
			}
		]);
	});

	it('names each mark differently for strong, quiet and cancelled Events', () => {
		const read = eventsAndTaskingsLane.read(
			inputs({
				status: 'ready',
				attention: { rows: [], total: 0, onTrack: [] },
				forecast: {
					events: [event('e1', { hasWork: true }), event('e1'), event('e1', { cancelled: true })],
					suspenses: []
				}
			})
		);

		const labels = read?.state === 'ready' ? read.marks.map((mark) => mark.label) : [];
		expect(new Set(labels).size).toBe(3);
	});

	it('holds a placeholder while pending and retries through the page once failed', () => {
		const updates = { retryTaskings: vi.fn() };

		expect(eventsAndTaskingsLane.read(inputs({ status: 'pending' }))).toEqual({ state: 'pending' });
		const failed = eventsAndTaskingsLane.read(inputs({ status: 'failed' }));
		expect(failed?.state).toBe('failed');
		if (failed?.state === 'failed') failed.retry(updates as never);
		expect(updates.retryTaskings).toHaveBeenCalledOnce();
	});

	it('leaves the lane out when the source is not read for this viewer', () => {
		expect(eventsAndTaskingsLane.read(inputs({ status: 'off' }))).toBeNull();
	});
});

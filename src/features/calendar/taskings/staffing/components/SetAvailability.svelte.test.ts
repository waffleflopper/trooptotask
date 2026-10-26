// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventRead } from '../../../events/eventModel';
import type { Tasking } from '../../taskingModel';
import type { TaskingPick } from '../staffingModel';
import SetAvailability from './SetAvailability.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('https://app.test/'), state: {} } }));

const TASKING = '00000000-0000-4000-8000-000000000101';
const ALICE = '00000000-0000-4000-8000-000000000501';
const BRUNO = '00000000-0000-4000-8000-000000000502';
const CARLA = '00000000-0000-4000-8000-000000000503';
const tasking: Tasking = {
	id: TASKING,
	title: 'Provide four trauma-lane medics',
	event: null,
	responsibility: { kind: 'organization' },
	suspenseOn: '2030-10-23',
	execution: { startsOn: '2030-10-19', endsOn: '2030-10-23', reportTime: null },
	requirement: null,
	instructions: null,
	status: { kind: 'open' },
	readiness: { equipment: null, checklist: null }
};
const pick = (personnelId: string): TaskingPick => ({
	personnelId,
	rank: 'SPC',
	firstName: 'Pat',
	lastName: 'Able',
	groupId: null,
	archived: false,
	selectedAt: '2030-10-01T00:00:00Z',
	reviewSince: null
});

function renderAction(gaps: Promise<EventRead<string[]>>) {
	return render(SetAvailability, {
		orgUrlSegment: 'c-co',
		tasking,
		execution: tasking.execution!,
		targets: [pick(ALICE), pick(BRUNO)],
		gaps
	});
}

afterEach(cleanup);

describe('SetAvailability', () => {
	it('links to Bulk Status for the picked people and execution dates, and counts who is not covered', async () => {
		renderAction(Promise.resolve({ status: 'loaded', value: [BRUNO] }));

		const link = screen.getByRole('link', { name: 'Set availability…' });
		const href = new URL(link.getAttribute('href') ?? '', 'https://app.test');
		expect(href.pathname).toBe('/org/c-co/calendar/bulk');
		expect(href.searchParams.get('people')).toBe(`${ALICE},${BRUNO}`);
		expect([href.searchParams.get('from'), href.searchParams.get('to')]).toEqual(['2030-10-19', '2030-10-23']);
		expect(await screen.findByText(/^1 of 2 picked people? ha(s|ve) no Availability/)).toBeTruthy();
	});

	it('keeps the action while the check loads and when it fails', async () => {
		renderAction(Promise.resolve({ status: 'failed' }));

		expect(screen.getByRole('link', { name: 'Set availability…' })).toBeTruthy();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy());
		expect(screen.queryByText(/no Availability covering/)).toBeNull();
	});

	it('shows a loading region until the check settles', () => {
		renderAction(new Promise(() => {}));

		expect(screen.getByRole('status', { name: 'Checking Availability' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Set availability…' })).toBeTruthy();
	});

	it('says everyone is covered when no one is left out', async () => {
		renderAction(Promise.resolve({ status: 'loaded', value: [] }));

		expect(await screen.findByText(/covers every execution day for everyone picked/)).toBeTruthy();
		expect(screen.queryByText(/no Availability covering/)).toBeNull();
	});

	it('checks again instead of showing the old coverage when the picks change', async () => {
		const view = renderAction(Promise.resolve({ status: 'loaded', value: [] }));
		await screen.findByText(/^Availability covers every execution day/);

		await view.rerender({ targets: [pick(ALICE), pick(BRUNO), pick(CARLA)], gaps: new Promise(() => {}) });

		expect(screen.getByRole('status', { name: 'Checking Availability' })).toBeTruthy();
		expect(screen.queryByText(/^Availability covers every execution day/)).toBeNull();
	});

	it('checks again when the picks change before their refreshed read arrives', async () => {
		const settled: Promise<EventRead<string[]>> = Promise.resolve({ status: 'loaded', value: [] });
		const view = renderAction(settled);
		await screen.findByText(/^Availability covers every execution day/);

		await view.rerender({ targets: [pick(ALICE), pick(BRUNO), pick(CARLA)], gaps: settled });
		await Promise.resolve();

		expect(screen.getByRole('status', { name: 'Checking Availability' })).toBeTruthy();
	});
});

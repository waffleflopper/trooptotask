// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffingPicker, TaskingAttentionRow, TaskingPick } from '$features/calendar';
import type { DashboardPageUpdates } from '../dashboardPageUpdates';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { DashboardInputs } from '../sections/dashboardInputs';
import { buildNeedsYouQueue } from '../sections/needsYou';
import { taskingAttention } from '../sections/taskingAttention';
import NeedsYouQueue from './NeedsYouQueue.svelte';

const short: TaskingAttentionRow = {
	taskingId: 't-graders',
	kind: 'short',
	title: 'Provide 3 lane graders (E-6+)',
	responsibility: { kind: 'organization' },
	eventTitle: 'Best Medic Competition',
	suspenseOn: '2026-10-23',
	executionStartsOn: '2026-10-19',
	required: 3,
	picked: 1,
	equipmentNotReady: 0
};
const conflict: TaskingAttentionRow = {
	...short,
	taskingId: 't-trauma',
	kind: 'conflict',
	title: 'Provide 2 trauma-lane medics',
	required: 2,
	picked: 2,
	conflict: {
		personnelId: 'p-okafor',
		personLabel: 'SGT Okafor',
		statusLabel: 'Leave',
		startsOn: '2026-10-20',
		endsOn: '2026-10-30',
		overlapDays: 4,
		executionDays: 5
	}
};

function pick(personnelId: string, lastName: string): TaskingPick {
	const at = '2026-10-18T00:00:00Z';
	return {
		personnelId,
		rank: 'SFC',
		firstName: 'Dana',
		lastName,
		groupId: null,
		mos: '68W',
		clinicRole: '',
		archived: false,
		selectedAt: at,
		reviewSince: null
	};
}

const candidate = (personnelId: string, lastName: string) => ({
	personnelId,
	rank: 'SSG',
	firstName: 'Lee',
	lastName,
	groupId: null,
	mos: '68W',
	clinicRole: ''
});

function picker(picks: TaskingPick[], revision: number): StaffingPicker {
	return {
		tasking: {
			requirement: { count: 3, qualifications: null },
			execution: { startsOn: '2026-10-19', endsOn: '2026-10-23', reportTime: null }
		},
		staffing: { revision, picked: picks.length, needsReview: 0, outsideScope: 0, picks },
		candidates: [candidate('p-hale', 'Hale'), candidate('p-moreno', 'Moreno'), candidate('p-okafor', 'Okafor')],
		advisories: { kind: 'loaded', byPerson: {} },
		states: {
			'p-novak': { kind: 'clear' },
			'p-hale': { kind: 'clear' },
			'p-moreno': { kind: 'clear' },
			'p-okafor': {
				kind: 'conflict',
				availability: [
					{
						kind: 'availability',
						label: 'Leave',
						startsOn: '2026-10-20',
						endsOn: '2026-10-30',
						isConflict: true,
						overlapDays: 4,
						executionDays: 5
					}
				]
			}
		}
	};
}

const graders = picker([pick('p-novak', 'Novak')], 4);
const medics: StaffingPicker = {
	...picker([pick('p-novak', 'Novak'), pick('p-okafor', 'Okafor')], 9),
	tasking: { ...graders.tasking, requirement: { count: 2, qualifications: null } }
};

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const fetchMock = vi.fn();
const saves = () =>
	fetchMock.mock.calls
		.filter(([, init]) => init?.method === 'PUT')
		.map(([url, init]) => ({ url, body: JSON.parse(init.body) }));

function serve(put: (url: string) => Promise<Response>) {
	fetchMock.mockImplementation((url: string, init?: RequestInit) => {
		if (init?.method === 'PUT') return put(url);
		return json(url.includes('t-graders') ? graders : medics);
	});
}

function renderQueue(refreshTaskings: () => Promise<void> = async () => {}) {
	const inputs = {
		today: '2026-10-18',
		forecastDays: [],
		groups: [],
		page: {
			orgId: 'org-1',
			orgName: 'C Co',
			taskings: {
				status: 'ready',
				attention: { rows: [short, conflict], total: 2, onTrack: [] },
				forecast: { events: [], suspenses: [] }
			}
		}
	} as unknown as DashboardInputs;
	const updates = { refreshSummary: vi.fn(), refreshTaskings, retryTaskings: vi.fn(), putRecord: vi.fn() };
	render(NeedsYouQueue, {
		props: {
			queue: buildNeedsYouQueue([taskingAttention(inputs)]),
			model: {} as DashboardScreenModel,
			access: { can: () => true, isPrivileged: false },
			updates: updates as unknown as DashboardPageUpdates
		}
	});
}

const slots = () => screen.queryAllByRole('list', { name: 'People to pick' });

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('NeedsYouQueue picking people in place', () => {
	it('saves the kept pick and both suggestions at the revision it read, and folds once Needs you is read again', async () => {
		serve(() => json({ outcome: 'saved', staffing: { ...graders.staffing, revision: 5 } }));
		let reread!: () => void;
		renderQueue(() => new Promise<void>((resolve) => (reread = resolve)));

		await fireEvent.click(screen.getByRole('button', { name: 'Pick 2' }));
		const confirm = await screen.findByRole('button', { name: /^Confirm 2/ });
		await fireEvent.click(confirm);

		await waitFor(() => expect(reread).toBeTypeOf('function'));
		expect(saves()).toEqual([
			{
				url: '/org/org-1/api/calendar-taskings/t-graders/people',
				body: {
					personnelIds: ['p-novak', 'p-hale', 'p-moreno'],
					keep: [],
					removeOutsideScope: false,
					expectedRevision: 4
				}
			}
		]);
		expect(slots()).toHaveLength(1);
		reread();
		await waitFor(() => expect(slots()).toHaveLength(0));
	});

	it('keeps the slots open after someone else saved first, and the next confirm builds on what they saved', async () => {
		const theirs = {
			revision: 6,
			picked: 2,
			needsReview: 0,
			outsideScope: 0,
			picks: [pick('p-novak', 'Novak'), pick('p-moreno', 'Moreno')]
		};
		serve(() => json({ outcome: 'conflict', staffing: theirs }, 409));
		const refreshTaskings = vi.fn(async () => {});
		renderQueue(refreshTaskings);

		await fireEvent.click(screen.getByRole('button', { name: 'Pick 2' }));
		await fireEvent.click(await screen.findByRole('button', { name: /^Confirm 2/ }));

		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(refreshTaskings).toHaveBeenCalledOnce();
		expect(slots()).toHaveLength(1);
		await fireEvent.click(screen.getByRole('button', { name: /^Confirm/ }));
		await waitFor(() => expect(saves()).toHaveLength(2));
		expect(saves()[1].body).toMatchObject({ personnelIds: ['p-novak', 'p-moreno', 'p-hale'], expectedRevision: 6 });
	});

	it('replaces only the conflicting person on Swap', async () => {
		serve(() => json({ outcome: 'saved', staffing: medics.staffing }));
		renderQueue();

		await fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
		await fireEvent.click(await screen.findByRole('button', { name: /^Confirm 1/ }));

		await waitFor(() => expect(saves()).toHaveLength(1));
		expect(saves()[0].body).toMatchObject({ personnelIds: ['p-novak', 'p-hale'], expectedRevision: 9 });
	});

	it('folds on Escape with nothing saved and returns focus to the action', async () => {
		serve(() => json({}));
		renderQueue();
		const action = screen.getByRole('button', { name: 'Pick 2' });

		await fireEvent.click(action);
		const [slot] = await screen.findAllByRole('button', { name: /^Selected:/ });
		slot.focus();
		await fireEvent.keyDown(slot, { key: 'Escape' });

		await waitFor(() => expect(slots()).toHaveLength(0));
		expect(document.activeElement).toBe(action);
		expect(saves()).toEqual([]);
	});

	it('keeps one row open at a time', async () => {
		serve(() => json({}));
		renderQueue();

		await fireEvent.click(screen.getByRole('button', { name: 'Pick 2' }));
		await screen.findByRole('list', { name: 'People to pick' });
		await fireEvent.click(screen.getByRole('button', { name: 'Swap' }));

		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Swap' }).getAttribute('aria-expanded')).toBe('true')
		);
		expect(screen.getByRole('button', { name: 'Pick 2' }).getAttribute('aria-expanded')).toBe('false');
	});
});

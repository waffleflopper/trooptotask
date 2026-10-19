// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelAttention, PersonnelFollowUp } from '$features/personnel/contracts';
import type { PersonnelActiveEvaluation } from '$features/rating-scheme/contracts';
import OverviewTabView from './OverviewTabView.svelte';

vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	invalidate: vi.fn().mockResolvedValue(undefined)
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

type Overview = ComponentProps<typeof OverviewTabView>['overview'];

const attention: PersonnelAttention = {
	items: [
		{
			kind: 'training',
			status: 'expired',
			id: 'cpr',
			title: 'CPR / BLS',
			detail: 'Lapsed 24 Sep · last completed 24 Sep 2024',
			dueDate: '2026-09-24',
			daysUntilDue: -12,
			target: { tab: 'readiness', item: { kind: 'training', id: 'cpr' } }
		},
		{
			kind: 'evaluation',
			status: 'due',
			id: 'entry-1',
			title: 'Annual NCOER',
			detail: 'Thru 30 Nov · rater SSG Alvarez · drafting',
			dueDate: '2026-11-30',
			daysUntilDue: 55,
			target: { tab: 'evals', entryId: 'entry-1' }
		}
	],
	readinessBadge: { count: 2, complete: false },
	checked: {
		training: { state: 'checked', currentCount: 14 },
		criticalTasks: { state: 'failed' },
		evaluation: { state: 'checked' },
		loss: { state: 'checked' },
		onboarding: { state: 'checked', status: 'none' }
	},
	failed: ['criticalTasks']
};

function followUp(id: string, title: string, dueDate: string | null): PersonnelFollowUp {
	return {
		id,
		personnelId: 'person-1',
		title,
		notes: '',
		dueDate,
		status: 'open',
		createdBy: '1SG Ramos',
		createdAt: '2026-10-01T12:00:00.000Z',
		updatedAt: '2026-10-01T12:00:00.000Z',
		completedAt: null,
		completedBy: null,
		archivedAt: null,
		archivedBy: null
	};
}

/** Answers every follow-up PATCH as completed and keeps each request for the test to read. */
function completingFetch() {
	const requests: { url: string; method: string; body: unknown }[] = [];
	vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
		requests.push({ url: String(input), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body)) });
		return new Response(JSON.stringify({ status: 'completed', completedAt: '2026-10-06T14:00:00.000Z' }), {
			headers: { 'content-type': 'application/json' }
		});
	});
	return requests;
}

const evaluation = {
	entryId: 'entry-1',
	evalType: 'NCOER',
	rater: 'SSG Alvarez',
	intermediateRater: null,
	seniorRater: '1SG Brooks',
	reviewer: null
} as PersonnelActiveEvaluation;

function overview(overrides: Partial<Overview> = {}): Overview {
	return {
		nextDays: Promise.resolve({
			rangeStart: '2026-10-06',
			rangeEnd: '2026-10-19',
			availability: [],
			statusTypes: [],
			assignments: [],
			assignmentTypes: [],
			specialDays: []
		}),
		attention: Promise.resolve(attention),
		openFollowUps: Promise.resolve([
			followUp('f-range', 'Range card', '2026-10-20'),
			followUp('f-dental', 'Dental readiness', '2026-10-02'),
			followUp('f-ta50', 'TA-50 shortage list', null),
			followUp('f-pt', 'PT test makeup', '2026-10-30')
		]),
		evaluation: Promise.resolve(evaluation),
		reach: Promise.resolve({
			phone: '907-555-0102',
			email: 'rivera@example.com',
			emergency: { name: 'Jamie Rivera', relationship: 'Spouse', phone: '907-555-0100' }
		}),
		lastCounseling: Promise.resolve({
			id: 'counseling-1',
			personnelId: 'person-1',
			dateConducted: '2026-10-03',
			title: 'Monthly performance',
			status: 'uploaded',
			uploadedBy: 'SSG Alvarez',
			fileName: 'monthly.pdf',
			createdAt: '2026-10-03T15:00:00Z'
		}),
		latestNote: Promise.resolve({
			id: 'note-1',
			personnelId: 'person-1',
			author: 'SFC Diaz',
			text: 'Ready for the board.',
			createdAt: '2026-10-05T15:00:00Z',
			archivedAt: null,
			archivedBy: null
		}),
		...overrides
	};
}

function props(value: Overview) {
	return {
		orgId: 'org-id-1',
		orgUrlSegment: 'org-1',
		person: { id: 'person-1', slug: 'rivera-monica' },
		asOf: '2026-10-06',
		overview: value
	};
}

function renderOverview(value: Overview = overview()) {
	return render(OverviewTabView, props(value));
}

const never = () => new Promise<never>(() => {});

describe('Personnel Overview', () => {
	it('links each attention row to the place a leader fixes it and names the source it could not check', async () => {
		renderOverview();

		const list = await screen.findByRole('list', { name: 'Needs attention' });
		const links = within(list).getAllByRole('link');
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/org/org-1/personnel/rivera-monica/readiness?item=training%3Acpr',
			'/org/org-1/evals?entry=entry-1'
		]);
		expect(screen.getByText(/Couldn't check critical tasks/)).toBeTruthy();
	});

	it('shows who to reach, the rating chain, the last counseling and the latest note', async () => {
		renderOverview();

		const chain = await screen.findByRole('region', { name: 'Rating chain' });
		expect(within(chain).getByText('Rating chain · NCOER')).toBeTruthy();
		expect(Array.from(chain.querySelectorAll('dt, dd'), (cell) => cell.textContent)).toEqual([
			'Rater',
			'SSG Alvarez',
			'Senior rater',
			'1SG Brooks',
			'Reviewer',
			'Not set'
		]);
		const reach = screen.getByRole('region', { name: 'Reach' });
		expect(within(reach).getByText('907-555-0102')).toBeTruthy();
		expect(within(reach).getByText('Emergency · Spouse')).toBeTruthy();
		const counseled = screen.getByRole('region', { name: 'Last counseled' });
		expect(within(counseled).getByText('3 days ago')).toBeTruthy();
		expect(within(counseled).getByText('Monthly performance · SSG Alvarez')).toBeTruthy();
		expect(screen.getByText('“Ready for the board.”')).toBeTruthy();
	});

	it('hides the Calendar and the rating chain when the viewer may not read them', async () => {
		renderOverview(overview({ nextDays: Promise.resolve(null), evaluation: Promise.resolve(null) }));

		await screen.findByRole('list', { name: 'Needs attention' });
		expect(screen.queryByRole('region', { name: 'Next 14 days' })).toBeNull();
		expect(screen.queryByRole('region', { name: 'Rating chain' })).toBeNull();
	});

	it('keeps every section on its own skeleton until it arrives', () => {
		renderOverview(
			overview({
				nextDays: never(),
				attention: never(),
				openFollowUps: never(),
				evaluation: never(),
				reach: never(),
				lastCounseling: never(),
				latestNote: never()
			})
		);

		expect(screen.queryByRole('list', { name: 'Needs attention' })).toBeNull();
		expect(
			Array.from(document.querySelectorAll('[aria-busy="true"]'), (section) => section.getAttribute('aria-label'))
		).toEqual(expect.arrayContaining(['Open follow-ups', 'Rating chain', 'Reach', 'Last counseled', 'Latest note']));
	});

	it('fails a section on its own while the rest of the Overview loads', async () => {
		renderOverview(
			overview({
				nextDays: Promise.reject(new Error('Calendar read failed')),
				latestNote: Promise.reject(new Error('Notes read failed'))
			})
		);

		const calendar = await screen.findByRole('region', { name: 'Next 14 days' });
		expect(within(calendar).getByText(/Couldn't load/)).toBeTruthy();
		expect(within(screen.getByRole('region', { name: 'Latest note' })).getByText(/Couldn't load/)).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Needs attention' })).toBeTruthy();
		expect(screen.getByText('Monthly performance · SSG Alvarez')).toBeTruthy();
	});

	it('counts open follow-ups and shows the three due soonest', async () => {
		renderOverview();

		const section = await screen.findByRole('region', { name: 'Open follow-ups' });
		expect(await within(section).findByText('4 open · 1 overdue')).toBeTruthy();
		expect(
			within(section)
				.getAllByRole('checkbox')
				.map((box) => box.getAttribute('aria-label'))
		).toEqual(['Complete Dental readiness', 'Complete Range card', 'Complete PT test makeup']);
		expect(within(section).getByText('Overdue 4 days')).toBeTruthy();
		expect(within(section).getByRole('link', { name: 'Open log' }).getAttribute('href')).toBe(
			'/org/org-1/personnel/rivera-monica/log'
		);
	});

	it('completes a follow-up in one click, keeps it in place to reopen and shows the next open one below', async () => {
		const requests = completingFetch();
		renderOverview();

		const section = await screen.findByRole('region', { name: 'Open follow-ups' });
		await fireEvent.click(await within(section).findByRole('checkbox', { name: 'Complete Dental readiness' }));

		expect(await within(section).findByText('3 open')).toBeTruthy();
		expect(
			within(section)
				.getAllByRole('checkbox')
				.map((box) => box.getAttribute('aria-label'))
		).toEqual([
			'Reopen Dental readiness',
			'Complete Range card',
			'Complete PT test makeup',
			'Complete TA-50 shortage list'
		]);
		expect(requests).toEqual([
			{
				url: '/org/org-id-1/api/personnel/person-1/follow-ups/f-dental',
				method: 'PATCH',
				body: { status: 'completed' }
			}
		]);
	});

	it('keeps a completion made here when the page receives a new data object holding the same loads', async () => {
		completingFetch();
		const loads = overview();
		const view = renderOverview({ ...loads });
		const section = await screen.findByRole('region', { name: 'Open follow-ups' });
		await fireEvent.click(await within(section).findByRole('checkbox', { name: 'Complete Dental readiness' }));
		await within(section).findByText('3 open');

		await view.rerender(props({ ...loads }));

		const refreshed = screen.getByRole('region', { name: 'Open follow-ups' });
		expect(await within(refreshed).findByText('3 open')).toBeTruthy();
		expect(within(refreshed).getByRole('checkbox', { name: 'Reopen Dental readiness' })).toBeTruthy();
	});
});

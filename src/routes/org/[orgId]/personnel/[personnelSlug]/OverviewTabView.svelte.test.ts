// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PersonnelAttention } from '$features/personnel/contracts';
import type { PersonnelActiveEvaluation } from '$features/rating-scheme/contracts';
import OverviewTabView from './OverviewTabView.svelte';

afterEach(cleanup);

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
			archivedAt: null
		}),
		...overrides
	};
}

function renderOverview(value: Overview = overview()) {
	return render(OverviewTabView, {
		orgUrlSegment: 'org-1',
		person: { slug: 'rivera-monica' },
		asOf: '2026-10-06',
		overview: value
	});
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
		expect(screen.getByText('2 items · most urgent first')).toBeTruthy();
		expect(screen.getByText("Couldn't check critical tasks. Reload the page to try again.")).toBeTruthy();
		expect(screen.getByText('Also checked: 14 training items current')).toBeTruthy();
		expect(screen.getByText('Nothing on the Calendar for the next 14 days.')).toBeTruthy();
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
				evaluation: never(),
				reach: never(),
				lastCounseling: never(),
				latestNote: never()
			})
		);

		expect(screen.queryByRole('list', { name: 'Needs attention' })).toBeNull();
		expect(
			Array.from(document.querySelectorAll('[aria-busy="true"]'), (section) => section.getAttribute('aria-label'))
		).toEqual(expect.arrayContaining(['Rating chain', 'Reach', 'Last counseled', 'Latest note']));
	});

	it('fails a section on its own while the rest of the Overview loads', async () => {
		renderOverview(
			overview({
				nextDays: Promise.reject(new Error('Calendar read failed')),
				latestNote: Promise.reject(new Error('Notes read failed'))
			})
		);

		expect(await screen.findByText("Couldn't load the Calendar. Reload the page to try again.")).toBeTruthy();
		expect(screen.getByText("Couldn't load notes. Reload the page to try again.")).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Needs attention' })).toBeTruthy();
		expect(screen.getByText('Monthly performance · SSG Alvarez')).toBeTruthy();
	});
});

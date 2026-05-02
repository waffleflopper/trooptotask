// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingSchemePageView from './RatingSchemePageView.svelte';
import { RatingSchemePageContext, type RatingSchemePageData } from '../contexts/RatingSchemePageContext.svelte';
import { ratingSchemeStore } from '../stores/ratingScheme.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { createOrgContext, type OrgContext } from '$lib/stores/orgContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

const { exportRatingSchemeMock } = vi.hoisted(() => ({
	exportRatingSchemeMock: vi.fn(async () => undefined)
}));

vi.mock('$features/rating-scheme/utils/ratingSchemeExport', () => ({
	exportRatingScheme: exportRatingSchemeMock
}));

const entries: RatingSchemeEntry[] = [
	{
		id: 'overdue',
		ratedPersonId: 'p1',
		evalType: 'NCOER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2025-01-01',
		ratingPeriodEnd: '2025-12-31',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'drafting'
	},
	{
		id: 'due-30',
		ratedPersonId: 'p2',
		evalType: 'OER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2026-04-01',
		ratingPeriodEnd: '2026-05-15',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'with-rater'
	}
];

const permissions = {
	canViewCalendar: false,
	canEditCalendar: false,
	canViewPersonnel: false,
	canEditPersonnel: false,
	canViewTraining: false,
	canEditTraining: false,
	canViewCriticalTasks: false,
	canEditCriticalTasks: false,
	canViewOnboarding: false,
	canEditOnboarding: false,
	canViewRatingScheme: true,
	canEditRatingScheme: true,
	canViewLeadersBook: false,
	canEditLeadersBook: false,
	canManageMembers: false
};

function makeOrg(): OrgContext {
	return createOrgContext({
		orgId: 'org-1',
		orgName: 'Test Org',
		userId: 'user-1',
		userRole: 'member',
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'operate'
		},
		scopeSet: { kind: 'organization' },
		permissions,
		scopedGroupId: null,
		isReadOnly: false
	});
}

function makeContext(modals = new ModalRegistry()): RatingSchemePageContext {
	const data: RatingSchemePageData = {
		orgId: 'org-1',
		orgName: 'Test Org',
		permissions,
		ratingSchemeEntries: entries
	};
	return new RatingSchemePageContext(data, modals, makeOrg(), entries);
}

describe('RatingSchemePageView', () => {
	beforeEach(() => {
		exportRatingSchemeMock.mockClear();
		ratingSchemeStore.load(entries, 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		ratingSchemeStore.load([], 'org-test-reset');
	});

	it('renders the Evals summary with only overdue, 60d, and 30d stats', () => {
		render(RatingSchemePageView, {
			props: {
				ctx: makeContext(),
				personnelLookup: [
					{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
					{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
				]
			}
		});

		const summary = screen.getByLabelText('Evaluation status summary');
		expect(within(summary).getByText('Overdue')).toBeTruthy();
		expect(within(summary).getByText('60d')).toBeTruthy();
		expect(within(summary).getByText('30d')).toBeTruthy();
		expect(screen.getByText('2 of 2 shown')).toBeTruthy();
		expect(within(summary).queryByText('Entries')).toBeNull();
		expect(within(summary).queryByText('Current')).toBeNull();
		expect(within(summary).queryByText('Due Soon')).toBeNull();
		expect(within(summary).queryByText('Access')).toBeNull();
	});

	it('uses shared toolbar filter controls instead of the old filter disclosure', async () => {
		const ctx = makeContext();

		render(RatingSchemePageView, {
			props: {
				ctx,
				personnelLookup: [
					{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
					{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
				]
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Evaluation controls' });
		expect(within(toolbar).getByRole('group', { name: 'Evaluation view mode' })).toBeTruthy();
		const typeFilter = within(toolbar).getByLabelText('Evaluation type filter') as HTMLSelectElement;
		expect(within(toolbar).getByLabelText('Evaluation status filter')).toBeTruthy();
		expect(within(toolbar).getByLabelText('Evaluation workflow filter')).toBeTruthy();
		expect(within(toolbar).queryByText('Filters')).toBeNull();

		await fireEvent.change(typeFilter, { target: { value: 'OER' } });

		expect(ctx.evalTypeFilter).toBe('OER');
	});

	it('routes Add Entry through the rating scheme page context', async () => {
		const modals = new ModalRegistry();
		const ctx = makeContext(modals);

		render(RatingSchemePageView, {
			props: {
				ctx,
				personnelLookup: [{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' }]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

		expect(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal')?.entry).toBeNull();
	});

	it('preserves evaluation view and export actions in the shared toolbar', async () => {
		const ctx = makeContext();
		const personnelLookup = [
			{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
			{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
		];

		render(RatingSchemePageView, {
			props: {
				ctx,
				personnelLookup
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Table' }));
		expect(ctx.ratingViewMode).toBe('table');

		await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
		expect(exportRatingSchemeMock).toHaveBeenCalledWith(ctx.filteredRatingEntries, personnelLookup);
	});

	it('collapses evaluation view and filters together at the shared group breakpoint', async () => {
		const originalRect = HTMLElement.prototype.getBoundingClientRect;

		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
			if (this.matches('[data-toolbar]')) {
				return {
					x: 0,
					y: 0,
					width: 520,
					height: 34,
					top: 0,
					right: 520,
					bottom: 34,
					left: 0,
					toJSON: () => ({})
				} as DOMRect;
			}
			return originalRect.call(this);
		});

		render(RatingSchemePageView, {
			props: {
				ctx: makeContext(),
				personnelLookup: [
					{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
					{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
				]
			}
		});

		await waitFor(() => {
			expect(screen.getByTestId('toolbar').getAttribute('data-toolbar-compact-phase')).toBe('group');
		});
		expect(screen.getByRole('button', { name: 'Evaluation filters' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Add Entry' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Evaluation filters' }));
		expect(screen.getByRole('button', { name: 'Table' })).toBeTruthy();
	});
});

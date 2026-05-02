// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';

const { mockOrgContext, exportRatingSchemeMock } = vi.hoisted(() => ({
	mockOrgContext: {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewRatingScheme: true,
			canEditRatingScheme: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		},
		scopedGroupId: null,
		readOnly: false,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },
		affordanceForFeatureAction: vi.fn(() => ({
			allowed: true,
			visible: true,
			disabled: false,
			reason: 'allowed:capability',
			explanation: 'Allowed',
			decision: {}
		})),
		affordanceForGovernanceAction: vi.fn(() => ({
			allowed: true,
			visible: true,
			disabled: false,
			reason: 'allowed:governance',
			explanation: 'Allowed',
			decision: {}
		})),
		hasCapability: vi.fn(() => true),
		isResourceInScope: vi.fn(() => true)
	},
	exportRatingSchemeMock: vi.fn(async () => undefined)
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => mockOrgContext
}));

vi.mock('$features/rating-scheme/utils/ratingSchemeExport', () => ({
	exportRatingScheme: exportRatingSchemeMock
}));

const entries: RatingSchemeEntry[] = [
	{
		id: 'oer-entry',
		ratedPersonId: 'person-1',
		evalType: 'OER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2026-01-01',
		ratingPeriodEnd: '2026-12-31',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'drafting'
	},
	{
		id: 'ncoer-entry',
		ratedPersonId: 'person-2',
		evalType: 'NCOER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2026-01-01',
		ratingPeriodEnd: '2026-12-31',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'with-rater'
	}
];

function pageData() {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		permissions: mockOrgContext.permissions,
		ratingScheme: {
			data: {
				ratingSchemeEntries: entries,
				personnelLookup: [
					{ id: 'person-1', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' },
					{ id: 'person-2', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' }
				],
				lossWarningWindowDays: 180
			}
		}
	};
}

describe('evals page', () => {
	beforeEach(() => {
		exportRatingSchemeMock.mockClear();
		ratingSchemeStore.load(entries, 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		ratingSchemeStore.load([], 'org-test-reset');
	});

	it('wires evaluation toolbar filters, view mode, and export action through the route', async () => {
		render(Page, { props: { data: pageData() } });

		expect(screen.getByRole('toolbar', { name: 'Evaluation controls' })).toBeTruthy();
		expect(screen.getByRole('status', { name: '2 of 2 shown' })).toBeTruthy();

		await fireEvent.change(screen.getByLabelText('Evaluation type filter'), { target: { value: 'NCOER' } });
		expect(screen.getByRole('status', { name: '1 of 2 shown' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Table' }));
		expect(screen.getByRole('columnheader', { name: 'Type' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
		expect(exportRatingSchemeMock).toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ id: 'ncoer-entry' })]),
			pageData().ratingScheme.data.personnelLookup
		);
	});
});

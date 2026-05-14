// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingViewsPage from './TrainingViewsPage.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import type { TrainingType, TrainingView } from '$features/training/training.types';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		affordanceForFeatureAction: () => ({
			allowed: true,
			visible: true,
			disabled: false,
			reason: 'allowed:capability',
			explanation: '',
			decision: {}
		})
	})
}));

const trainingTypes: TrainingType[] = [
	{
		id: 'type-1',
		name: 'ACFT',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#22c55e',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false
	},
	{
		id: 'type-2',
		name: 'Weapons Qual',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#f59e0b',
		sortOrder: 1,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false
	}
];

const trainingViews: TrainingView[] = [
	{
		id: 'view-1',
		name: 'Annual Requirements',
		columnIds: ['type-1', 'type-2'],
		createdBy: 'user-1',
		createdAt: '2026-05-10T00:00:00.000Z',
		updatedAt: '2026-05-10T00:00:00.000Z'
	}
];

describe('TrainingViewsPage', () => {
	beforeEach(() => {
		trainingTypesStore.load(trainingTypes, 'org-1');
		trainingViewsStore.load(trainingViews, 'org-1');
	});

	afterEach(() => {
		cleanup();
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
	});

	it('renders saved training views in the type workspace', () => {
		render(TrainingViewsPage);

		expect(screen.getByRole('toolbar', { name: 'Training view controls' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back to Matrix' }).getAttribute('href')).toBe('/org/org-1/training');
		expect(screen.getByRole('button', { name: /Annual Requirements/i })).toBeTruthy();
		expect(screen.getByText('ACFT, Weapons Qual')).toBeTruthy();
	});
});

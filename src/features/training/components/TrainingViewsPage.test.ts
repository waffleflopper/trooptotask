// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingViewsPage from './TrainingViewsPage.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import type { TrainingType, TrainingView } from '$features/training/training.types';

const org = {
	orgId: 'org-1',
	affordanceForFeatureAction: () => ({
		allowed: true,
		visible: true,
		disabled: false,
		reason: 'allowed:capability',
		explanation: '',
		decision: {}
	})
} as unknown as import('../contracts').TrainingPageAccess;

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
		vi.unstubAllGlobals();
		cleanup();
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
	});

	it('renders saved training views in the type workspace', () => {
		render(TrainingViewsPage, { props: { org } });

		expect(screen.getByRole('toolbar', { name: 'Training view controls' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back to Matrix' }).getAttribute('href')).toBe('/org/org-1/training');
		expect(screen.getByRole('row', { name: 'Annual Requirements' })).toBeTruthy();
		expect(screen.getByText('ACFT, Weapons Qual')).toBeTruthy();
	});

	it.each(['create', 'edit'] as const)('retains a failed %s draft and saves on explicit retry', async (mode) => {
		let respond!: (response: Response) => void;
		const response = new Promise<Response>((resolve) => {
			respond = resolve;
		});
		const savedView: TrainingView = {
			id: mode === 'create' ? 'view-created' : 'view-1',
			name: 'Range priorities',
			columnIds: mode === 'create' ? [] : ['type-1', 'type-2'],
			createdBy: 'user-1',
			createdAt: '2026-05-10T00:00:00.000Z',
			updatedAt: '2026-10-06T00:00:00.000Z'
		};
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(response).mockResolvedValueOnce(Response.json(savedView)));
		render(TrainingViewsPage, { props: { org } });
		await fireEvent.click(screen.getByRole('button', { name: mode === 'create' ? 'New View' : 'Edit' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'View Name' }), {
			target: { value: 'Range priorities' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(screen.getByRole('button', { name: 'Saving...' }).hasAttribute('disabled')).toBe(true);

		respond(new Response(null, { status: 503 }));
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);
		});
		expect((screen.getByRole('textbox', { name: 'View Name' }) as HTMLInputElement).value).toBe('Range priorities');
		expect(screen.getByRole('alert').textContent?.trim()).toMatch(/\S/);
		expect(trainingViewsStore.items).toEqual(trainingViews);

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => {
			expect(screen.queryByRole('textbox', { name: 'View Name' })).toBeNull();
		});
		expect(trainingViewsStore.items).toEqual(mode === 'create' ? [...trainingViews, savedView] : [savedView]);
	});

	it('moves focus to the new view row after a create', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					id: 'view-created',
					name: 'Range priorities',
					columnIds: [],
					createdBy: 'user-1',
					createdAt: '2026-10-06T00:00:00.000Z',
					updatedAt: '2026-10-06T00:00:00.000Z'
				})
			)
		);
		render(TrainingViewsPage, { props: { org } });
		await fireEvent.click(screen.getByRole('button', { name: 'New View' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'View Name' }), {
			target: { value: 'Range priorities' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('row', { name: 'Range priorities' })));
		expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
	});

	it('clears the required-name error once a name is typed', async () => {
		render(TrainingViewsPage, { props: { org } });
		await fireEvent.click(screen.getByRole('button', { name: 'New View' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(screen.getByText('Name is required.')).toBeTruthy();

		await fireEvent.input(screen.getByRole('textbox', { name: 'View Name' }), {
			target: { value: 'Range priorities' }
		});

		expect(screen.queryByText('Name is required.')).toBeNull();
	});
});

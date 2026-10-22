// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { openToolbarMore, stubToolbarWidths, toolbarDescription } from '$lib/test-support/toolbarWidths';
import TrainingViewsPage from './TrainingViewsPage.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import type { TrainingType, TrainingView } from '$features/training/training.types';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const viewer = {
	orgId: 'org-1',
	affordanceForFeatureAction: () => ({
		allowed: false,
		visible: true,
		disabled: true,
		reason: 'denied:capability',
		explanation: '',
		decision: {}
	})
} as unknown as import('../contracts').TrainingPageAccess;

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
		vi.mocked(goto).mockClear();
		vi.unstubAllGlobals();
		cleanup();
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
	});

	it('keeps a failed delete open with its reason and the view still listed', async () => {
		const requests: string[] = [];
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			requests.push(`${init.method} ${JSON.parse(init.body as string).id}`);
			return Response.json({ message: 'Internal server error' }, { status: 500 });
		});
		render(TrainingViewsPage, { props: { org } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete View' }));
		const dialog = screen.getByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		expect(await within(dialog).findByText('Failed to delete view. Try again.')).toBeTruthy();
		expect(requests).toEqual(['DELETE view-1']);
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

	it.each([
		['create', 400, 'Invalid ID', 'Invalid ID'],
		['edit', 404, 'That Training view is no longer available.', 'That Training view is no longer available.'],
		['edit', 500, 'Internal server error', 'Failed to save view.']
	] as const)('keeps a rejected %s draft and shows the reason for a %i', async (mode, status, serverMessage, shown) => {
		vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status }));
		render(TrainingViewsPage, { props: { org } });
		await fireEvent.click(screen.getByRole('button', { name: mode === 'create' ? 'New View' : 'Edit' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'View Name' }), {
			target: { value: 'Range priorities' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent?.trim()).toBe(shown));
		expect((screen.getByRole('textbox', { name: 'View Name' }) as HTMLInputElement).value).toBe('Range priorities');
		expect(trainingViewsStore.items).toEqual(trainingViews);
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

	it.each(['New View', 'Edit'])('moves focus into the View Name field when %s opens the editor', async (name) => {
		render(TrainingViewsPage, { props: { org } });
		const opener = screen.getByRole('button', { name });
		opener.focus();
		await fireEvent.click(opener);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'View Name' })));
	});

	it('keeps focus on the other direction when a column reaches the end of the order', async () => {
		render(TrainingViewsPage, { props: { org } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		const moveDown = screen.getByRole('button', { name: 'Move ACFT down' });
		moveDown.focus();
		await fireEvent.click(moveDown);

		expect(screen.getByRole('button', { name: 'Move ACFT down' }).hasAttribute('disabled')).toBe(true);
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move ACFT up' })));

		await fireEvent.click(screen.getByRole('button', { name: 'Move ACFT up' }));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move ACFT down' })));
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

	it('leaves a viewer only the way back to the matrix', () => {
		render(TrainingViewsPage, { props: { org: viewer } });

		expect(screen.queryByRole('toolbar', { name: 'Training view detail controls' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'New View' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Back to Matrix' })).toBeTruthy();
	});

	it('gives a viewer no New View or Edit in More either, only Back to Matrix', async () => {
		const widths = stubToolbarWidths();
		try {
			render(TrainingViewsPage, { props: { org: viewer } });
			await widths.foldAll();

			const menu = await openToolbarMore('Training view controls');
			expect(within(menu).getByRole('menuitem', { name: 'Back to Matrix' })).toBeTruthy();
			expect(within(menu).queryByRole('menuitem', { name: 'New View' })).toBeNull();
			expect(within(menu).queryByRole('menuitem', { name: 'Edit' })).toBeNull();
			expect(screen.queryByRole('toolbar', { name: 'Training view detail controls' })).toBeNull();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('disables New View with its reason while a view is being edited', async () => {
		render(TrainingViewsPage, { props: { org } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		const newView = within(screen.getByRole('toolbar', { name: 'Training view controls' })).getByRole('button', {
			name: 'New View'
		}) as HTMLButtonElement;
		expect(newView.disabled).toBe(true);
		expect(toolbarDescription(newView)).toBe('Finish the current edit first');
		expect(screen.queryByRole('toolbar', { name: 'Training view detail controls' })).toBeNull();
	});

	it('moves Back to Matrix into More before New View and still navigates from there', async () => {
		const widths = stubToolbarWidths();
		try {
			render(TrainingViewsPage, { props: { org } });
			await widths.foldAll();

			const toolbar = screen.getByRole('toolbar', { name: 'Training view controls' });
			expect(within(toolbar).queryByRole('link', { name: 'Back to Matrix' })).toBeNull();
			expect(within(toolbar).getByRole('button', { name: 'New View' })).toBeTruthy();

			const menu = await openToolbarMore('Training view controls');
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Back to Matrix' }));
			await waitFor(() => expect(goto).toHaveBeenCalledWith('/org/org-1/training'));
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

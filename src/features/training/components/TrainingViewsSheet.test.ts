// @vitest-environment happy-dom
import type { ComponentProps } from 'svelte';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import TrainingViewsSheet from './TrainingViewsSheet.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import type { TrainingType, TrainingView } from '$features/training/training.types';

function makeType(id: string, name: string, sortOrder: number, overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id,
		name,
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
		sortOrder,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

const trainingTypes = [
	makeType('t-sharp', 'SHARP', 0),
	makeType('t-eo', 'EO', 1),
	makeType('t-cyber', 'Cyber Awareness', 2),
	makeType('t-cls', 'CLS', 3, { expirationMonths: 36 }),
	makeType('t-license', 'Mil license', 4, { expirationDateOnly: true, expirationMonths: null })
];

function makeView(id: string, name: string, columnIds: string[]): TrainingView {
	return {
		id,
		name,
		columnIds,
		createdBy: 'user-1',
		createdAt: '2026-05-10T00:00:00.000Z',
		updatedAt: '2026-05-10T00:00:00.000Z'
	};
}

const annual = makeView('view-annual', 'Annual trainings', ['t-eo', 't-sharp']);
const medical = makeView('view-medical', 'Aid station', ['t-cls']);

type SheetProps = ComponentProps<typeof TrainingViewsSheet>;
type Props = Partial<{
	canMutate: boolean;
	saveView: Mock<SheetProps['saveView']>;
	deleteView: Mock<SheetProps['deleteView']>;
	returnFocusTo: SheetProps['returnFocusTo'];
	onClose: Mock<SheetProps['onClose']>;
}>;

function renderSheet(props: Props = {}) {
	const saveView =
		props.saveView ??
		vi.fn<SheetProps['saveView']>(async (draft) => makeView(draft.id ?? 'view-new', draft.name, draft.columnIds));
	const deleteView = props.deleteView ?? vi.fn<SheetProps['deleteView']>(async () => 'deleted');
	const onClose = props.onClose ?? vi.fn<SheetProps['onClose']>();
	render(TrainingViewsSheet, {
		props: {
			orgId: 'org-1',
			canMutate: props.canMutate ?? true,
			saveView,
			deleteView,
			returnFocusTo: props.returnFocusTo,
			onClose
		}
	});
	return { saveView, deleteView, onClose };
}

function checkedNames(): string[] {
	const list = screen.getByRole('list', { name: 'Trainings in this view' });
	return within(list)
		.getAllByRole('checkbox')
		.map(
			(box) =>
				box.getAttribute('aria-label') ?? document.querySelector(`label[for="${box.id}"]`)?.textContent?.trim() ?? ''
		);
}

async function openEditor(name: string) {
	await fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
	await screen.findByRole('textbox', { name: 'View name' });
}

describe('TrainingViewsSheet', () => {
	beforeEach(() => {
		trainingTypesStore.load(trainingTypes, 'org-1');
		trainingViewsStore.load([annual, medical], 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
	});

	it('lists saved views A to Z with how many columns each shows', () => {
		renderSheet();

		const names = screen
			.getAllByRole('button', { name: /columns$/ })
			.map((row) => row.querySelector('span span')?.textContent);
		expect(names).toEqual(['Aid station', 'Annual trainings']);
		expect(screen.getByRole('button', { name: 'Annual trainings 2 of 5 columns' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'New view' })).toBeTruthy();
	});

	it('opens a view with its checked trainings in column order and the rest below', async () => {
		renderSheet();
		await openEditor('Annual trainings');

		expect(checkedNames()).toEqual(['EO', 'SHARP']);
		const rest = screen.getByRole('heading', { name: /^Not in this view/ }).closest('section')!;
		expect(
			within(rest)
				.getAllByRole('checkbox')
				.map((box) => box.id)
		).toEqual(['view-type-t-cyber', 'view-type-t-cls', 'view-type-t-license']);
	});

	it('adds a checked training to the end and moves an unchecked one below', async () => {
		renderSheet();
		await openEditor('Annual trainings');

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Cyber Awareness' }));
		expect(checkedNames()).toEqual(['EO', 'SHARP', 'Cyber Awareness']);

		await fireEvent.click(screen.getByRole('checkbox', { name: 'EO' }));
		expect(checkedNames()).toEqual(['SHARP', 'Cyber Awareness']);
		const rest = screen.getByRole('heading', { name: /^Not in this view/ }).closest('section')!;
		expect(within(rest).getByRole('checkbox', { name: 'EO' })).toBeTruthy();
	});

	it('keeps focus on a training after it changes lists', async () => {
		renderSheet();
		await openEditor('Annual trainings');

		await fireEvent.click(screen.getByRole('checkbox', { name: 'CLS' }));

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'CLS' })));
	});

	it('reorders a checked training with Alt and the arrow keys', async () => {
		renderSheet();
		await openEditor('Annual trainings');

		await fireEvent.keyDown(screen.getByRole('checkbox', { name: 'SHARP' }), { key: 'ArrowUp', altKey: true });

		await waitFor(() => expect(checkedNames()).toEqual(['SHARP', 'EO']));
	});

	it('saves the name and the ordered column ids, then returns to the list', async () => {
		const { saveView } = renderSheet();
		await openEditor('Annual trainings');

		await fireEvent.click(screen.getByRole('checkbox', { name: 'CLS' }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'EO' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'View name' }), { target: { value: 'Yearly' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save view' }));

		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'View name' })).toBeNull());
		expect(saveView).toHaveBeenCalledWith({ id: 'view-annual', name: 'Yearly', columnIds: ['t-sharp', 't-cls'] });
		await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-view-id="view-annual"]')));
	});

	it('creates a new view with no columns and asks for a name first', async () => {
		const { saveView } = renderSheet();
		await fireEvent.click(screen.getByRole('button', { name: 'New view' }));
		await screen.findByRole('textbox', { name: 'View name' });

		await fireEvent.click(screen.getByRole('button', { name: 'Save view' }));
		expect(saveView).not.toHaveBeenCalled();
		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'View name' }));

		await fireEvent.input(screen.getByRole('textbox', { name: 'View name' }), { target: { value: '  Range  ' } });
		await fireEvent.click(screen.getByRole('checkbox', { name: 'CLS' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save view' }));

		await waitFor(() => expect(saveView).toHaveBeenCalledWith({ id: null, name: 'Range', columnIds: ['t-cls'] }));
	});

	it('keeps the draft and shows the reason when a save fails', async () => {
		const saveView = vi.fn().mockRejectedValue(new Error('Failed to save view.'));
		renderSheet({ saveView });
		await openEditor('Annual trainings');
		await fireEvent.input(screen.getByRole('textbox', { name: 'View name' }), { target: { value: 'Yearly' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save view' }));

		expect((await screen.findByRole('alert')).textContent).toContain('Failed to save view.');
		expect((screen.getByRole('textbox', { name: 'View name' }) as HTMLInputElement).value).toBe('Yearly');
		expect((screen.getByRole('button', { name: 'Save view' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('writes nothing when the save resolves after the user left the Organization', async () => {
		const saveView = vi.fn().mockResolvedValue('stale');
		renderSheet({ saveView });
		await openEditor('Annual trainings');
		await fireEvent.input(screen.getByRole('textbox', { name: 'View name' }), { target: { value: 'Yearly' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save view' }));

		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Save view' }) as HTMLButtonElement).disabled).toBe(false)
		);
		expect((screen.getByRole('textbox', { name: 'View name' }) as HTMLInputElement).value).toBe('Yearly');
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('holds the sheet open while a save is in flight', async () => {
		let finish!: (view: TrainingView) => void;
		const saveView = vi.fn(
			() =>
				new Promise<TrainingView>((resolve) => {
					finish = resolve;
				})
		);
		const { onClose } = renderSheet({ saveView });
		await openEditor('Annual trainings');
		await fireEvent.click(screen.getByRole('button', { name: 'Save view' }));
		expect((screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Back to all views' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		expect(onClose).not.toHaveBeenCalled();

		finish(annual);
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'View name' })).toBeNull());
	});

	it('blocks leaving a changed editor by the back arrow and Escape, but Cancel discards', async () => {
		const { onClose } = renderSheet();
		await openEditor('Annual trainings');
		await fireEvent.input(screen.getByRole('textbox', { name: 'View name' }), { target: { value: 'Yearly' } });

		expect((screen.getByRole('button', { name: 'Back to all views' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.keyDown(screen.getByRole('textbox', { name: 'View name' }), { key: 'Escape' });
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('textbox', { name: 'View name' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('textbox', { name: 'View name' })).toBeNull();
		await openEditor('Annual trainings');
		expect((screen.getByRole('textbox', { name: 'View name' }) as HTMLInputElement).value).toBe('Annual trainings');
	});

	it('goes back to the list from an unchanged editor', async () => {
		renderSheet();
		await openEditor('Annual trainings');

		await fireEvent.click(screen.getByRole('button', { name: 'Back to all views' }));

		expect(screen.queryByRole('textbox', { name: 'View name' })).toBeNull();
		expect(screen.getByRole('button', { name: 'New view' })).toBeTruthy();
	});

	it('returns focus to the opener when the sheet closes', async () => {
		const opener = document.createElement('button');
		document.body.append(opener);
		const { onClose } = renderSheet({ returnFocusTo: () => opener });

		await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

		await waitFor(() => expect(document.activeElement).toBe(opener));
		expect(onClose).toHaveBeenCalled();
		opener.remove();
	});

	it('deletes a view after the confirm and returns to the list', async () => {
		const { deleteView } = renderSheet();
		await openEditor('Aid station');

		await fireEvent.click(screen.getByRole('button', { name: 'Delete view' }));
		const confirm = screen.getByRole('alertdialog');
		expect(confirm.textContent).toContain('Aid station');
		await fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(deleteView).toHaveBeenCalledWith('view-medical'));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByRole('textbox', { name: 'View name' })).toBeNull();
	});

	it('keeps the confirm open with the reason when a delete fails', async () => {
		const deleteView = vi.fn().mockResolvedValue('failed');
		renderSheet({ deleteView });
		await openEditor('Aid station');
		await fireEvent.click(screen.getByRole('button', { name: 'Delete view' }));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

		expect(await within(screen.getByRole('alertdialog')).findByText('Failed to delete view. Try again.')).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'View name' })).toBeTruthy();
	});

	it('offers no editing to someone who cannot manage views', () => {
		renderSheet({ canMutate: false });

		expect(screen.queryByRole('button', { name: 'New view' })).toBeNull();
		expect(
			(screen.getByRole('button', { name: 'Annual trainings 2 of 5 columns' }) as HTMLButtonElement).disabled
		).toBe(true);
	});

	it('shows a loading state until both lists belong to this Organization', () => {
		trainingViewsStore.load([annual], 'org-stale');

		renderSheet();

		expect(screen.getByRole('status', { name: 'Loading training views' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'New view' })).toBeNull();
	});
});

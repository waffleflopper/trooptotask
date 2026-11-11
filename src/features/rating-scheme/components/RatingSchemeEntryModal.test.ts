// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingSchemeEntryModal from './RatingSchemeEntryModal.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';

const entry: RatingSchemeEntry = {
	id: 'entry-1',
	ratedPersonId: 'rated-1',
	evalType: 'NCOER',
	raterPersonId: 'rater-1',
	raterName: null,
	seniorRaterPersonId: 'senior-1',
	seniorRaterName: null,
	intermediateRaterPersonId: null,
	intermediateRaterName: null,
	reviewerPersonId: null,
	reviewerName: null,
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31',
	notes: null,
	reportType: 'AN',
	workflowStatus: null
};

const personnel = [
	{ id: 'rated-1', rank: 'SGT', lastName: 'Rated', firstName: 'Riley' },
	{ id: 'rater-1', rank: 'SSG', lastName: 'Rater', firstName: 'Robin' },
	{ id: 'senior-1', rank: 'SFC', lastName: 'Senior', firstName: 'Sam' }
];

// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
const inDisabledGroup = (control: HTMLElement) => control.closest('fieldset[disabled]') !== null;

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function renderWorkflow(
	value: RatingSchemeEntry,
	handlers: Pick<ComponentProps<typeof RatingSchemeEntryModal>, 'onMove' | 'onChangeRater'> & { onClose?: () => void }
) {
	return render(RatingSchemeEntryModal, {
		props: {
			entry: value,
			personnel,
			isCurrentWorkspace: () => true,
			onSave: vi.fn(),
			onMove: handlers.onMove,
			onChangeRater: handlers.onChangeRater,
			onClose: handlers.onClose ?? vi.fn()
		}
	});
}

describe('RatingSchemeEntryModal', () => {
	it('locks the draft while a save is held and unlocks it with the draft after a failure', async () => {
		let rejectSave!: (error: Error) => void;
		const onSave = vi.fn(
			() =>
				new Promise<void>((_, reject) => {
					rejectSave = reject;
				})
		);
		vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(RatingSchemeEntryModal, {
			props: { entry, personnel, isCurrentWorkspace: () => true, onSave, onClose: vi.fn() }
		});
		const dialog = screen.getByRole('dialog', { name: 'SGT Rated, Riley' });
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Draft A' } });
		const save = screen.getByRole('button', { name: 'Save changes' });

		await fireEvent.click(save);
		await fireEvent.click(save);

		expect(onSave).toHaveBeenCalledTimes(1);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		for (const control of [
			screen.getByLabelText('Notes'),
			screen.getByRole('group', { name: 'Type' }),
			screen.getByRole('button', { name: 'Rater' })
		]) {
			expect(inDisabledGroup(control)).toBe(true);
		}

		rejectSave(new Error('Save denied'));

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		const notes = screen.getByLabelText('Notes') as HTMLTextAreaElement;
		expect(notes.value).toBe('Draft A');
		expect(inDisabledGroup(notes)).toBe(false);
	});

	it('ties each missing required control to its own error after an empty Save', async () => {
		const onSave = vi.fn();
		render(RatingSchemeEntryModal, {
			props: { entry: null, personnel, isCurrentWorkspace: () => true, onSave, onClose: vi.fn() }
		});
		expect(screen.getByRole('button', { name: 'Rated Soldier' }).getAttribute('aria-invalid')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

		expect(onSave).not.toHaveBeenCalled();
		for (const name of ['Rated Soldier', 'Rater', 'Senior rater', 'Start', 'Thru']) {
			const control = screen.getByRole('button', { name });
			expect(control.getAttribute('aria-invalid')).toBe('true');
			const descriptions = (control.getAttribute('aria-describedby') ?? '')
				.split(/\s+/)
				.filter(Boolean)
				.map((id) => document.getElementById(id));
			const error = descriptions.find((node) => node?.getAttribute('role') === 'alert');
			expect(error?.textContent).toMatch(/\S/);
		}
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rated Soldier' })));
		expect(screen.getByRole('group', { name: 'Type' }).getAttribute('aria-invalid')).toBeNull();
	});

	it('saves a rater typed in as an external name and not as a person', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(RatingSchemeEntryModal, {
			props: { entry, personnel, isCurrentWorkspace: () => true, onSave, onClose: vi.fn() }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Rater' }));
		const search = screen
			.getAllByPlaceholderText('Search unit or type a name...')
			.find((input) => input.closest('[data-state="open"]'));
		await fireEvent.input(search!, { target: { value: 'COL Visiting' } });
		await fireEvent.click(await screen.findByRole('option', { name: 'Use "COL Visiting" as an external rater' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		expect(onSave.mock.calls[0][0]).toMatchObject({ raterName: 'COL Visiting', raterPersonId: null });
	});

	it('reports a failed save inside the dialog, returns focus to Save and holds Escape over the draft', async () => {
		const toastError = vi.spyOn(toastStore, 'error');
		const onClose = vi.fn();
		const onSave = vi.fn().mockRejectedValue(new Error('Failed to update rating entry'));
		render(RatingSchemeEntryModal, {
			props: { entry, personnel, isCurrentWorkspace: () => true, onSave, onClose }
		});
		const dialog = screen.getByRole('dialog', { name: 'SGT Rated, Riley' });
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Draft A' } });
		const save = screen.getByRole('button', { name: 'Save changes' });
		await fireEvent.click(save);

		await waitFor(() => expect(document.activeElement).toBe(save));
		expect(within(dialog).getByRole('alert').textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Rating entry was not saved Failed to update rating entry'
		);
		expect(toastError).not.toHaveBeenCalled();
		expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Draft A');

		await fireEvent.keyDown(save, { key: 'Escape' });
		expect(onClose).not.toHaveBeenCalled();
	});

	it('closes an untouched entry on Escape', async () => {
		const onClose = vi.fn();
		render(RatingSchemeEntryModal, {
			props: { entry, personnel, isCurrentWorkspace: () => true, onSave: vi.fn(), onClose }
		});

		await fireEvent.keyDown(screen.getByRole('dialog', { name: 'SGT Rated, Riley' }), { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('starts tracking a not-tracked evaluation and offers the moves from the step it reached', async () => {
		const onMove = vi.fn().mockResolvedValue('drafting');
		renderWorkflow(entry, { onMove });

		await fireEvent.click(screen.getByRole('button', { name: 'Start tracking' }));

		expect(onMove).toHaveBeenCalledWith('entry-1', 'drafting', expect.any(Function));
		expect(await screen.findByRole('button', { name: 'Stop tracking' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Start tracking' })).toBeNull();
	});

	it.each([
		[{}, 'with-rated-soldier'],
		[{ intermediateRaterName: 'LTC Intermediate' }, 'with-intermediate-rater'],
		[{ reviewerPersonId: 'senior-1' }, 'with-reviewer']
	] as const)('moves forward from SR Signed to the next present role %j', async (roles, expected) => {
		const onMove = vi.fn().mockResolvedValue(expected);
		renderWorkflow({ ...entry, ...roles, workflowStatus: 'sr-signed' }, { onMove });

		await fireEvent.click(screen.getByRole('button', { name: /^Move to/ }));

		expect(onMove).toHaveBeenCalledWith('entry-1', expected, expect.any(Function));
	});

	it('steps back to the previous step', async () => {
		const onMove = vi.fn().mockResolvedValue('with-rater');
		renderWorkflow({ ...entry, workflowStatus: 'rater-signed' }, { onMove });

		await fireEvent.click(screen.getByRole('button', { name: /^Back to/ }));

		expect(onMove).toHaveBeenCalledWith('entry-1', 'with-rater', expect.any(Function));
	});

	it('reopens a completed evaluation as not tracked and offers no change of rater', async () => {
		const onMove = vi.fn().mockResolvedValue(null);
		renderWorkflow({ ...entry, workflowStatus: 'completed' }, { onMove, onChangeRater: vi.fn() });
		expect(screen.queryByRole('button', { name: 'Change rater' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

		expect(onMove).toHaveBeenCalledWith('entry-1', null, expect.any(Function));
		expect(await screen.findByRole('button', { name: 'Start tracking' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Change rater' })).toBeTruthy();
	});

	it('keeps the step and explains a refused move inside the dialog', async () => {
		const onMove = vi.fn().mockRejectedValue(new Error('This evaluation has changed since you opened it.'));
		renderWorkflow({ ...entry, workflowStatus: 'drafting' }, { onMove });
		const dialog = screen.getByRole('dialog', { name: 'SGT Rated, Riley' });

		await fireEvent.click(screen.getByRole('button', { name: /^Move to/ }));

		expect((await within(dialog).findByRole('alert')).textContent).toContain(
			'This evaluation has changed since you opened it.'
		);
		expect(screen.getByRole('button', { name: 'Stop tracking' })).toBeTruthy();
	});

	it('holds workflow moves while the draft has unsaved edits', async () => {
		const onMove = vi.fn();
		renderWorkflow({ ...entry, workflowStatus: 'drafting' }, { onMove });

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Unsaved' } });
		await fireEvent.click(screen.getByRole('button', { name: /^Move to/ }));

		expect(onMove).not.toHaveBeenCalled();
		expect((screen.getByRole('button', { name: /^Move to/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	describe('change of rater', () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2027-03-01T12:00:00'));
		});
		afterEach(() => vi.useRealTimers());

		async function openChangeRater() {
			await fireEvent.click(screen.getByRole('button', { name: 'Change rater' }));
			return screen.findByRole('alertdialog', { name: 'Change rater' });
		}

		async function chooseExternalRater(name: string, confirm?: HTMLElement) {
			confirm ??= await openChangeRater();
			await fireEvent.click(within(confirm).getByRole('button', { name: 'New rater' }));
			const search = screen
				.getAllByPlaceholderText('Search unit or type a name...')
				.find((input) => input.closest('[data-state="open"]'));
			await fireEvent.input(search!, { target: { value: name } });
			await fireEvent.click(await screen.findByRole('option', { name: `Use "${name}" as an external rater` }));
			return confirm;
		}

		it('sends one new rater with the last day clamped to the rating period, then closes', async () => {
			const onChangeRater = vi.fn().mockResolvedValue(true);
			const onClose = vi.fn();
			vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
			renderWorkflow({ ...entry, workflowStatus: 'with-rater' }, { onChangeRater, onClose });

			const confirm = await chooseExternalRater('SSG Incoming');
			await fireEvent.click(within(confirm).getByRole('button', { name: 'Change rater' }));

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
			expect(onChangeRater).toHaveBeenCalledWith(
				'entry-1',
				{ changeDate: '2026-12-31', raterPersonId: null, raterName: 'SSG Incoming' },
				expect.any(Function)
			);
		});

		it('asks for the new rater and drops the ask once one is chosen', async () => {
			const onChangeRater = vi.fn();
			renderWorkflow({ ...entry, workflowStatus: 'with-rater' }, { onChangeRater });

			const confirm = await openChangeRater();
			await fireEvent.click(within(confirm).getByRole('button', { name: 'Change rater' }));

			expect(within(confirm).getByRole('alert')).toBeTruthy();
			await chooseExternalRater('SSG Incoming', confirm);
			expect(within(confirm).queryByRole('alert')).toBeNull();
			expect(onChangeRater).not.toHaveBeenCalled();
		});

		it('keeps the change open and explains a refused change', async () => {
			const onChangeRater = vi.fn().mockRejectedValue(new Error('The new rater is already this rater'));
			const onClose = vi.fn();
			renderWorkflow({ ...entry, workflowStatus: 'with-rater' }, { onChangeRater, onClose });

			const confirm = await chooseExternalRater('SSG Incoming');
			await fireEvent.click(within(confirm).getByRole('button', { name: 'Change rater' }));

			expect((await within(confirm).findByRole('alert')).textContent).toContain('The new rater is already this rater');
			expect(onClose).not.toHaveBeenCalled();
		});
	});
});

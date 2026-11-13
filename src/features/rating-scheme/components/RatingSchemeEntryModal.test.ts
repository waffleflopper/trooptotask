import '@testing-library/jest-dom/vitest';
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingSchemeEntryModal from './RatingSchemeEntryModal.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';

const entry: RatingSchemeEntry = {
	id: 'entry-1',
	ratingSchemeId: 'scheme-1',
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
	workflowStatus: null,
	archivedAt: null,
	chainSigned: false
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
		const onMove = vi.fn().mockResolvedValue({ ...entry, workflowStatus: 'drafting' });
		renderWorkflow(entry, { onMove });

		await fireEvent.click(screen.getByRole('button', { name: 'Start tracking' }));

		expect(onMove).toHaveBeenCalledWith('entry-1', { from: null, to: 'drafting' }, expect.any(Function));
		expect(await screen.findByRole('button', { name: 'Stop tracking' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Start tracking' })).toBeNull();
	});

	it.each([
		['sr-signed', {}, 'with-rated-soldier'],
		['sr-signed', { reviewerPersonId: 'senior-1' }, 'with-reviewer'],
		['rater-signed', {}, 'with-senior-rater'],
		['rater-signed', { intermediateRaterName: 'LTC Intermediate' }, 'with-intermediate-rater']
	] as const)('moves forward from %s to the next present role %j', async (from, roles, expected) => {
		const onMove = vi.fn().mockResolvedValue({ ...entry, ...roles, workflowStatus: expected });
		renderWorkflow({ ...entry, ...roles, workflowStatus: from }, { onMove });

		await fireEvent.click(screen.getByRole('button', { name: /^Move to/ }));

		expect(onMove).toHaveBeenCalledWith('entry-1', { from, to: expected }, expect.any(Function));
	});

	it('steps back to the previous step', async () => {
		const onMove = vi.fn().mockResolvedValue({ ...entry, workflowStatus: 'with-rater' });
		renderWorkflow({ ...entry, workflowStatus: 'rater-signed' }, { onMove });

		await fireEvent.click(screen.getByRole('button', { name: /^Back to/ }));

		expect(onMove).toHaveBeenCalledWith('entry-1', { from: 'rater-signed', to: 'with-rater' }, expect.any(Function));
	});

	it('offers Command Review beside the next step from drafting', async () => {
		const onMove = vi.fn().mockResolvedValue({ ...entry, workflowStatus: 'command-review' });
		renderWorkflow({ ...entry, workflowStatus: 'drafting' }, { onMove });
		expect(screen.getByRole('button', { name: 'Move to With Rater' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Send to Command Review' }));

		expect(onMove).toHaveBeenCalledWith('entry-1', { from: 'drafting', to: 'command-review' }, expect.any(Function));
		expect(await screen.findByRole('button', { name: 'Back to Drafting' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Move to With Rater' })).toBeTruthy();
	});

	async function openJumpTargets() {
		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Jump to step' }));
		return within(screen.getByRole('listbox', { name: 'Jump to step' }));
	}

	it('jumps from SM Signed back to Drafting in one move', async () => {
		const onMove = vi.fn().mockResolvedValue({ ...entry, workflowStatus: 'drafting' });
		renderWorkflow({ ...entry, workflowStatus: 'sm-signed' }, { onMove });

		const targets = await openJumpTargets();
		const drafting = targets.getByRole('option', { name: 'Drafting' });
		await fireEvent.pointerDown(drafting);
		await fireEvent.pointerUp(drafting);

		expect(onMove).toHaveBeenCalledExactlyOnceWith(
			'entry-1',
			{ from: 'sm-signed', to: 'drafting' },
			expect.any(Function)
		);
		expect(await screen.findByRole('button', { name: 'Stop tracking' })).toBeTruthy();
	});

	it('lists the steps this entry has evaluators for, without the current step', async () => {
		renderWorkflow({ ...entry, reviewerName: 'COL Reviewer', workflowStatus: 'sr-signed' }, { onMove: vi.fn() });

		const targets = await openJumpTargets();

		expect(targets.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual([
			'Drafting',
			'Command Review',
			'With Rater',
			'Rater Signed',
			'With Senior Rater',
			'With Reviewer',
			'Reviewer Signed',
			'With Rated Soldier',
			'SM Signed',
			'Submitted to HRC',
			'Completed'
		]);
	});

	it('holds the jump while the draft has unsaved edits', async () => {
		renderWorkflow({ ...entry, workflowStatus: 'drafting' }, { onMove: vi.fn() });

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Unsaved' } });

		expect((screen.getByRole('button', { name: 'Jump to step' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('reopens a completed evaluation as not tracked and offers no change of rater', async () => {
		const onMove = vi.fn().mockResolvedValue({ ...entry, workflowStatus: null });
		renderWorkflow({ ...entry, workflowStatus: 'completed' }, { onMove, onChangeRater: vi.fn() });
		expect(screen.queryByRole('button', { name: 'Change rater' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

		expect(onMove).toHaveBeenCalledWith('entry-1', { from: 'completed', to: null }, expect.any(Function));
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

	describe('rating scheme listing', () => {
		const onScheme = { ...entry, workflowStatus: 'completed' as const };
		const off = { ...onScheme, archivedAt: '2026-06-01T00:00:00.000Z' };

		function renderListing(
			value: RatingSchemeEntry,
			onArchive?: ComponentProps<typeof RatingSchemeEntryModal>['onArchive']
		) {
			return render(RatingSchemeEntryModal, {
				props: { entry: value, personnel, isCurrentWorkspace: () => true, onSave: vi.fn(), onArchive, onClose: vi.fn() }
			});
		}

		it.each([
			['an open evaluation', { ...entry, workflowStatus: 'drafting' as const }],
			['a completed evaluation', onScheme]
		])('archives %s and then offers to restore it', async (_label, value) => {
			const onArchive = vi.fn().mockResolvedValue('2026-06-01T00:00:00.000Z');
			renderListing(value, onArchive);

			await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

			expect(onArchive).toHaveBeenCalledWith('scheme-1', true, expect.any(Function));
			expect(await screen.findByRole('button', { name: 'Restore to rating scheme' })).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
		});

		it('restores an archived evaluation and offers to archive it again', async () => {
			const onArchive = vi.fn().mockResolvedValue(null);
			renderListing(off, onArchive);

			await fireEvent.click(screen.getByRole('button', { name: 'Restore to rating scheme' }));

			expect(onArchive).toHaveBeenCalledWith('scheme-1', false, expect.any(Function));
			expect(await screen.findByRole('button', { name: 'Archive' })).toBeTruthy();
		});

		it('keeps the listing and explains a refused archive inside the dialog', async () => {
			const onArchive = vi.fn().mockRejectedValue(new Error('You need Evals operation access for this Group.'));
			renderListing(onScheme, onArchive);
			const dialog = screen.getByRole('dialog', { name: 'SGT Rated, Riley' });

			await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

			expect((await within(dialog).findByRole('alert')).textContent).toContain(
				'You need Evals operation access for this Group.'
			);
			expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy();
		});

		it('keeps the listing when the workspace changed before the answer', async () => {
			renderListing(onScheme, vi.fn().mockResolvedValue(undefined));

			await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

			await waitFor(() =>
				expect((screen.getByRole('button', { name: 'Archive' }) as HTMLButtonElement).disabled).toBe(false)
			);
		});

		it('keeps an archived open evaluation due past its thru date and offers no change of rater', () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2027-03-01T12:00:00'));
			try {
				render(RatingSchemeEntryModal, {
					props: {
						entry: { ...off, workflowStatus: 'with-rater' },
						personnel,
						isCurrentWorkspace: () => true,
						onSave: vi.fn(),
						onMove: vi.fn(),
						onArchive: vi.fn(),
						onChangeRater: vi.fn(),
						onClose: vi.fn()
					}
				});

				const dialog = screen.getByRole('dialog');
				expect(dialog).not.toHaveAccessibleDescription('Archived');
				expect(screen.getByRole('button', { name: 'Restore to rating scheme' })).toBeTruthy();
				expect(screen.queryByRole('button', { name: 'Change rater' })).toBeNull();
			} finally {
				vi.useRealTimers();
			}
		});
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

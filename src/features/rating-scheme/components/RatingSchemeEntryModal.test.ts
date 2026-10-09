// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
	status: 'active',
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
		const dialog = screen.getByRole('dialog', { name: 'Edit Rating Entry' });
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Draft A' } });
		const save = screen.getByRole('button', { name: 'Save' });

		await fireEvent.click(save);
		await fireEvent.click(save);

		expect(onSave).toHaveBeenCalledTimes(1);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		for (const control of [
			screen.getByLabelText('Notes'),
			screen.getByLabelText('Evaluation Type'),
			screen.getAllByRole('button', { name: 'External' })[0]
		]) {
			expect(inDisabledGroup(control)).toBe(true);
		}

		rejectSave(new Error('Save denied'));

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		const notes = screen.getByLabelText('Notes') as HTMLTextAreaElement;
		expect(notes.value).toBe('Draft A');
		expect(inDisabledGroup(notes)).toBe(false);
	});
});

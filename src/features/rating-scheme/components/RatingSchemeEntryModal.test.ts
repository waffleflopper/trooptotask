// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

function describedBy(element: HTMLElement): string[] {
	return (element.getAttribute('aria-describedby') ?? '')
		.split(/\s+/)
		.filter(Boolean)
		.map((id) => document.getElementById(id)?.textContent?.trim() ?? `missing #${id}`);
}

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

	it('ties each missing required control to its own error after an empty Save', async () => {
		const onSave = vi.fn();
		render(RatingSchemeEntryModal, {
			props: { entry: null, personnel, isCurrentWorkspace: () => true, onSave, onClose: vi.fn() }
		});
		const dialog = screen.getByRole('dialog', { name: 'Add Rating Entry' });
		expect(screen.getByLabelText('Rated individual').getAttribute('aria-invalid')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(onSave).not.toHaveBeenCalled();
		expect(
			within(dialog)
				.getAllByRole('alert')
				.map((alert) => alert.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual([
			'Complete required fields Missing: rated individual, rater, senior rater, rating period start, thru date.',
			'Rated individual is required.',
			'Rater is required.',
			'Senior rater is required.',
			'Rating period start is required.',
			'Thru date is required.'
		]);
		const invalid = [
			'Rated individual',
			'Rater from organization',
			'Senior rater from organization',
			'Rating Period Start',
			'Thru Date (Due)'
		].map((label) => {
			const control = screen.getByLabelText(label);
			return [label, control.getAttribute('aria-invalid'), describedBy(control).at(-1)];
		});
		expect(invalid).toEqual([
			['Rated individual', 'true', 'Rated individual is required.'],
			['Rater from organization', 'true', 'Rater is required.'],
			['Senior rater from organization', 'true', 'Senior rater is required.'],
			['Rating Period Start', 'true', 'Rating period start is required.'],
			['Thru Date (Due)', 'true', 'Thru date is required.']
		]);
		expect(screen.getByLabelText('Evaluation Type').getAttribute('aria-invalid')).toBeNull();
	});

	it('reports a failed save inside the dialog, returns focus to Save and holds Escape over the draft', async () => {
		const toastError = vi.spyOn(toastStore, 'error');
		const onClose = vi.fn();
		const onSave = vi.fn().mockRejectedValue(new Error('Failed to update rating entry'));
		render(RatingSchemeEntryModal, {
			props: { entry, personnel, isCurrentWorkspace: () => true, onSave, onClose }
		});
		const dialog = screen.getByRole('dialog', { name: 'Edit Rating Entry' });
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Draft A' } });
		const save = screen.getByRole('button', { name: 'Save' });
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

		await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Edit Rating Entry' }), { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

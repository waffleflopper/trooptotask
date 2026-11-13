import '@testing-library/jest-dom/vitest';
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RatingSchemeLineSheet from './RatingSchemeLineSheet.svelte';
import { evaluation, line, linePersonnel } from '../utils/ratingSchemeLineTestData';

type Props = ComponentProps<typeof RatingSchemeLineSheet>;

function renderSheet(overrides: Partial<Props> = {}) {
	const props: Props = {
		orgId: 'org-1',
		line: line('scheme-1'),
		personnel: linePersonnel,
		listedPersonIds: new Set(['watanabe']),
		isCurrentWorkspace: () => true,
		onSave: vi.fn().mockResolvedValue(undefined),
		onArchive: vi.fn().mockResolvedValue(undefined),
		onChangeRater: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};
	render(RatingSchemeLineSheet, { props });
	return props;
}

async function pick(trigger: string, option: string) {
	await fireEvent.click(screen.getByRole('button', { name: trigger }));
	await fireEvent.click(await screen.findByRole('option', { name: option }));
}

afterEach(cleanup);

describe('RatingSchemeLineSheet adding a line', () => {
	it('asks for the Rated Soldier, rater and senior rater before it saves anything', async () => {
		const props = renderSheet({ line: null });

		await fireEvent.click(screen.getByRole('button', { name: 'Add to scheme' }));

		expect(props.onSave).not.toHaveBeenCalled();
		for (const name of ['Rated Soldier', 'Rater', 'Senior rater']) {
			expect(screen.getByRole('button', { name }).getAttribute('aria-invalid')).toBe('true');
		}
	});

	it('offers only people without a listed scheme, then saves the chain with the eval type their rank implies', async () => {
		const props = renderSheet({ line: null });

		await fireEvent.click(screen.getByRole('button', { name: 'Rated Soldier' }));
		const options = (await screen.findAllByRole('option')).map((option) => option.textContent?.trim());
		expect(options).not.toContain('SGT Watanabe, Kenji');
		await fireEvent.click(screen.getByRole('option', { name: 'CPT Reyes, Ana' }));
		await pick('Rater', 'SSG Alvarez, Marisol');
		await pick('Senior rater', '1LT Chen, Wei');
		await fireEvent.click(screen.getByRole('button', { name: 'Add to scheme' }));

		await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
		expect(vi.mocked(props.onSave).mock.calls[0][0]).toEqual({
			kind: 'create',
			values: expect.objectContaining({
				ratedPersonId: 'reyes',
				evalType: 'OER',
				raterPersonId: 'alvarez',
				seniorRaterPersonId: 'chen',
				reviewerPersonId: null
			})
		});
		await waitFor(() => expect(props.onClose).toHaveBeenCalled());
	});
});

describe('RatingSchemeLineSheet editing a line', () => {
	it('sends only the field that changed', async () => {
		const props = renderSheet();

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Moves in March' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
		expect(vi.mocked(props.onSave).mock.calls[0][0]).toEqual({ kind: 'update', patch: { notes: 'Moves in March' } });
	});

	it('closes without a request when nothing changed', async () => {
		const props = renderSheet();

		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(props.onSave).not.toHaveBeenCalled();
		expect(props.onClose).toHaveBeenCalledTimes(1);
	});

	it('keeps the sheet open and shows the reason when the save is refused', async () => {
		const props = renderSheet({ onSave: vi.fn().mockRejectedValue(new Error('Another editor changed this line.')) });

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'x' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect((await screen.findByRole('alert')).textContent).toContain('Another editor changed this line.');
		expect(props.onClose).not.toHaveBeenCalled();
	});

	it('holds Escape over unsaved edits and closes an untouched sheet', async () => {
		const onClose = vi.fn();
		renderSheet({ onClose });
		const dialog = screen.getByRole('dialog');

		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(1);

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'edit' } });
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('archives and restores through the listing section', async () => {
		const onArchive = vi.fn().mockResolvedValue(undefined);
		renderSheet({ onArchive });
		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
		expect(onArchive).toHaveBeenCalledWith('scheme-1', true, expect.any(Function));
		cleanup();

		renderSheet({ onArchive, line: line('scheme-1', { archivedAt: '2026-02-01T00:00:00Z' }) });
		await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
		expect(onArchive).toHaveBeenLastCalledWith('scheme-1', false, expect.any(Function));
	});
});

describe('RatingSchemeLineSheet with an open Evaluation', () => {
	const open = evaluation('eval-1', 'scheme-1', { workflowStatus: 'with-senior-rater' });

	it('locks the rater behind Change rater while the other roles stay editable', async () => {
		const props = renderSheet({ line: line('scheme-1', { open }) });

		expect(screen.queryByRole('button', { name: 'Rater' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Senior rater' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Change rater' }));

		expect(props.onChangeRater).toHaveBeenCalledWith(expect.objectContaining({ id: 'scheme-1' }));
	});

	it('holds Change rater while the chain has unsaved edits', async () => {
		renderSheet({ line: line('scheme-1', { open }) });

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'edit' } });

		expect(screen.getByRole('button', { name: 'Change rater' })).toBeDisabled();
	});

	it('links to the open Evaluation in Eval Tracker and never edits its step', () => {
		renderSheet({ line: line('scheme-1', { open }) });
		const dialog = screen.getByRole('dialog');

		expect(within(dialog).getByText('With Senior Rater')).toBeTruthy();
		expect(
			within(dialog)
				.getByRole('link', { name: /Open in Eval Tracker/ })
				.getAttribute('href')
		).toBe('/org/org-1/evals?entry=eval-1');
	});

	it('leaves the rater editable when no Evaluation is open', () => {
		renderSheet({ line: line('scheme-1', { open: null }) });

		expect(screen.getByRole('button', { name: 'Rater' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Change rater' })).toBeNull();
	});
});

// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import EvaluationSheet from './EvaluationSheet.svelte';
import { evaluation, linePersonnel, scheme } from '../utils/ratingSchemeLineTestData';

type Props = ComponentProps<typeof EvaluationSheet>;

function renderSheet(overrides: Partial<Props> = {}) {
	const props: Props = {
		orgId: 'org-1',
		evaluation: evaluation('eval-1', 'scheme-1', { workflowStatus: 'with-rater' }),
		scheme: scheme('scheme-1'),
		personnel: linePersonnel,
		isCurrentWorkspace: () => true,
		onSave: vi.fn().mockResolvedValue(undefined),
		onMove: vi.fn().mockResolvedValue(undefined),
		onClose: vi.fn(),
		...overrides
	};
	render(EvaluationSheet, { props });
	return props;
}

const steps = () => within(screen.getByRole('list', { name: 'Workflow steps' }));

async function pick(trigger: string, option: string) {
	await fireEvent.click(screen.getByRole('button', { name: trigger }));
	await fireEvent.click(await screen.findByRole('option', { name: option }));
}

afterEach(() => {
	cleanup();
	toastStore.dismiss();
});

describe('EvaluationSheet workflow', () => {
	it('jumps only to steps the chain it shows makes possible', async () => {
		const props = renderSheet();

		expect(steps().queryByRole('button', { name: 'Jump to With Intermediate Rater' })).toBeNull();
		expect(steps().queryByRole('button', { name: 'Jump to With Reviewer' })).toBeNull();
		await fireEvent.click(steps().getByRole('button', { name: 'Jump to With Senior Rater' }));

		await waitFor(() =>
			expect(props.onMove).toHaveBeenCalledWith(
				'eval-1',
				{ from: 'with-rater', to: 'with-senior-rater' },
				expect.any(Function)
			)
		);
	});

	it('offers the intermediate rater step once the scheme names one', () => {
		renderSheet({ scheme: scheme('scheme-1', { intermediateRaterPersonId: 'reyes' }) });

		expect(steps().getByRole('button', { name: 'Jump to With Intermediate Rater' })).toBeEnabled();
	});

	it('holds workflow moves while an edit is unsaved', async () => {
		renderSheet();

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Waiting on counseling' } });

		expect(steps().getByRole('button', { name: 'Jump to With Senior Rater' })).toBeDisabled();
	});

	it('shows why a refused move did not happen and stays open', async () => {
		const props = renderSheet({ onMove: vi.fn().mockRejectedValue(new Error('The senior rater is not set.')) });

		await fireEvent.click(steps().getByRole('button', { name: 'Jump to With Senior Rater' }));

		expect((await screen.findByRole('alert')).textContent).toContain('The senior rater is not set.');
		expect(props.onClose).not.toHaveBeenCalled();
	});
});

describe('EvaluationSheet saving', () => {
	it('sends only the period field that changed', async () => {
		const props = renderSheet();

		await fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'CR' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(props.onSave).toHaveBeenCalledWith('eval-1', { reportType: 'CR' }, expect.any(Function))
		);
		await waitFor(() => expect(props.onClose).toHaveBeenCalled());
	});
});

describe('EvaluationSheet next rater', () => {
	it('names a next rater only once the report is a Change of Rater, and saves it with the report', async () => {
		const props = renderSheet();

		expect(screen.queryByRole('button', { name: 'Next rater' })).toBeNull();
		await fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'CR' } });
		await pick('Next rater', 'SGT Park, Lena');
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(props.onSave).toHaveBeenCalledWith(
				'eval-1',
				{ reportType: 'CR', nextRaterPersonId: 'park', nextRaterName: null },
				expect.any(Function)
			)
		);
	});

	it('holds workflow moves until the next rater is saved', async () => {
		renderSheet({ evaluation: evaluation('eval-1', 'scheme-1', { reportType: 'CR', workflowStatus: 'with-rater' }) });

		await pick('Next rater', 'SGT Park, Lena');

		expect(steps().getByRole('button', { name: 'Jump to With Senior Rater' })).toBeDisabled();
	});

	it('shows the next rater read-only once the Change of Rater moved its scheme, even after a reopen', () => {
		const settled = { reportType: 'CR', nextRaterPersonId: 'park', raterChangedAt: '2026-12-31T12:00:00Z' } as const;
		renderSheet({ evaluation: evaluation('eval-1', 'scheme-1', { ...settled, workflowStatus: 'completed' }) });

		expect(screen.queryByRole('button', { name: 'Next rater' })).toBeNull();
		expect(screen.getByLabelText('Next rater').textContent).toContain('Park');
		cleanup();

		renderSheet({ evaluation: evaluation('eval-1', 'scheme-1', { ...settled, workflowStatus: 'with-rater' }) });

		expect(screen.queryByRole('button', { name: 'Next rater' })).toBeNull();
		expect(screen.getByLabelText('Next rater').textContent).toContain('Park');
	});
});

describe('EvaluationSheet on a completed Evaluation', () => {
	const signed = evaluation('eval-1', 'scheme-1', {
		workflowStatus: 'completed',
		signedChain: {
			raterPersonId: 'alvarez',
			raterName: null,
			intermediateRaterPersonId: null,
			intermediateRaterName: null,
			seniorRaterPersonId: 'left-the-unit',
			seniorRaterName: null,
			reviewerPersonId: null,
			reviewerName: null,
			signedAt: '2026-02-03T12:00:00Z'
		}
	});

	it('offers reopen steps from its scheme, or from the chain it kept once it settled a Change of Rater', () => {
		const withReviewer = scheme('scheme-1', { reviewerName: 'COL Reviewer' });
		renderSheet({ evaluation: signed, scheme: withReviewer });

		expect(steps().getByRole('button', { name: 'Jump to With Reviewer' })).toBeEnabled();
		cleanup();

		renderSheet({
			evaluation: { ...signed, reportType: 'CR', raterChangedAt: '2026-02-03T12:00:00Z' },
			scheme: withReviewer
		});

		expect(steps().queryByRole('button', { name: 'Jump to With Reviewer' })).toBeNull();
	});

	it('shows the chain that signed it, not the scheme as it stands now', () => {
		renderSheet({ evaluation: signed });

		const signers = within(screen.getByLabelText('Signed by'));
		expect(signers.getByText(/Alvarez/)).toBeInTheDocument();
		expect(signers.queryByText(/Chen/)).toBeNull();
		expect(screen.getByRole('note').textContent).toContain('Chen');
	});

	it('saves a notes edit alone, though a signer has left Personnel, and keeps the report and period locked', async () => {
		const props = renderSheet({ evaluation: signed });

		expect(screen.getByLabelText('Report')).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Filed in iPERMS' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(props.onSave).toHaveBeenCalledWith('eval-1', { notes: 'Filed in iPERMS' }, expect.any(Function))
		);
	});

	it('opens another of the Soldier’s Evaluations from its history', async () => {
		const onOpenEvaluation = vi.fn();
		const earlier = evaluation('eval-0', 'scheme-1', {
			workflowStatus: 'completed',
			ratingPeriodStart: '2025-01-01',
			ratingPeriodEnd: '2025-12-31'
		});
		renderSheet({ evaluation: signed, evaluations: [signed, earlier], onOpenEvaluation });

		const history = within(screen.getByRole('list', { name: /evaluations$/ }));
		await fireEvent.click(history.getByRole('button'));

		expect(onOpenEvaluation).toHaveBeenCalledWith('eval-0');
	});

	it('holds history while an edit is unsaved', async () => {
		const earlier = evaluation('eval-0', 'scheme-1', {
			workflowStatus: 'completed',
			ratingPeriodStart: '2025-01-01',
			ratingPeriodEnd: '2025-12-31'
		});
		const current = evaluation('eval-1', 'scheme-1', { workflowStatus: 'with-rater' });
		renderSheet({ evaluation: current, evaluations: [current, earlier], onOpenEvaluation: vi.fn() });

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Waiting on counseling' } });

		expect(within(screen.getByRole('list', { name: /evaluations$/ })).getByRole('button')).toBeDisabled();
	});
});

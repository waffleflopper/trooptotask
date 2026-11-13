// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StartEvaluationSheet from './StartEvaluationSheet.svelte';
import { readyToStart } from '../utils/evalTracker';
import { evaluation, linePersonnel, scheme } from '../utils/ratingSchemeLineTestData';

type Props = ComponentProps<typeof StartEvaluationSheet>;

const ready = readyToStart(
	[scheme('scheme-watanabe'), scheme('scheme-park', { ratedPersonId: 'park' })],
	[
		evaluation('last-annual', 'scheme-watanabe', {
			workflowStatus: 'completed',
			ratingPeriodStart: '2025-01-01',
			ratingPeriodEnd: '2025-12-31'
		})
	]
);

function renderSheet(overrides: Partial<Props> = {}) {
	const props: Props = {
		orgId: 'org-1',
		ready,
		ratingSchemeId: null,
		personnel: linePersonnel,
		isCurrentWorkspace: () => true,
		onStart: vi.fn().mockResolvedValue(undefined),
		onClose: vi.fn(),
		...overrides
	};
	render(StartEvaluationSheet, { props });
	return props;
}

afterEach(cleanup);

describe('StartEvaluationSheet', () => {
	it('starts the next Annual the day after the last one ends, at Drafting', async () => {
		const props = renderSheet({ ratingSchemeId: 'scheme-watanabe' });

		await fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }));

		await waitFor(() =>
			expect(props.onStart).toHaveBeenCalledWith(
				'scheme-watanabe',
				{
					reportType: 'AN',
					ratingPeriodStart: '2026-01-01',
					ratingPeriodEnd: '2026-12-31',
					completed: false,
					notes: null
				},
				expect.any(Function)
			)
		);
		await waitFor(() => expect(props.onClose).toHaveBeenCalled());
	});

	it('asks who it is for before it starts anything', async () => {
		const props = renderSheet();

		await fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }));

		expect(props.onStart).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Rated Soldier' }).getAttribute('aria-invalid')).toBe('true');
	});

	it('opens with nobody picked when a link names a scheme that already has work in progress', async () => {
		const props = renderSheet({ ratingSchemeId: 'scheme-busy' });
		const picker = screen.getByRole('button', { name: 'Rated Soldier' });

		expect(picker.textContent).not.toContain('scheme-busy');
		await fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }));
		expect(props.onStart).not.toHaveBeenCalled();
		expect(picker.getAttribute('aria-invalid')).toBe('true');
	});

	it('records an Evaluation already completed for the person picked', async () => {
		const props = renderSheet();

		await fireEvent.click(screen.getByRole('button', { name: 'Rated Soldier' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'SGT Watanabe, Kenji' }));
		await fireEvent.click(screen.getByRole('radio', { name: /Already completed/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Record evaluation' }));

		await waitFor(() =>
			expect(props.onStart).toHaveBeenCalledWith(
				'scheme-watanabe',
				expect.objectContaining({ completed: true }),
				expect.any(Function)
			)
		);
	});
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { EVALUATION_SHEET_MODAL, type EvaluationSheetPayload } from '../contexts/EvalTrackerContext.svelte';
import { loadRatingSchemeEntries, ratingSchemeEntryFixture } from '../ratingSchemeStore.test-support.svelte';
import { linePersonnel } from '../utils/ratingSchemeLineTestData';
import EvalTrackerModals from './EvalTrackerModals.svelte';

const { gotoMock, pageMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(async () => {}),
	pageMock: {
		url: new URL('http://localhost/org/org-1/evals?entry=eval-open'),
		shallow: null as { url: URL } | null,
		state: {} as App.PageState
	}
}));

vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/state', () => ({ page: pageMock }));

const shared = { ratingSchemeId: 'scheme-1', ratedPersonId: 'watanabe', raterPersonId: 'alvarez' };

beforeEach(() =>
	loadRatingSchemeEntries(
		[
			ratingSchemeEntryFixture({ ...shared, id: 'eval-open', workflowStatus: 'with-rater' }),
			ratingSchemeEntryFixture({
				...shared,
				id: 'eval-done',
				workflowStatus: 'completed',
				ratingPeriodStart: '2024-04-01',
				ratingPeriodEnd: '2025-03-31'
			})
		],
		'org-1'
	)
);
afterEach(() => {
	cleanup();
	loadRatingSchemeEntries([], 'org-cleanup');
	gotoMock.mockClear();
});

describe('EvalTrackerModals', () => {
	it('keeps a linked sheet tied to the address when it switches to another Evaluation in its history', async () => {
		const modals = new ModalRegistry();
		modals.open(EVALUATION_SHEET_MODAL, { evaluationId: 'eval-open', fromUrl: true } satisfies EvaluationSheetPayload);
		render(EvalTrackerModals, {
			props: { orgId: 'org-1', modals, personnelLookup: linePersonnel, onRequestDeletion: async () => false }
		});

		const history = await screen.findByRole('list', { name: /evaluations$/ });
		await fireEvent.click(within(history).getByRole('button'));

		expect(modals.payload<EvaluationSheetPayload>(EVALUATION_SHEET_MODAL)).toEqual({
			evaluationId: 'eval-done',
			fromUrl: true
		});
		expect(gotoMock).toHaveBeenCalledWith(
			'/org/org-1/evals?entry=eval-done',
			expect.objectContaining({ replace: true })
		);
	});
});

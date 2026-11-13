// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { EVALUATION_SHEET_MODAL, EvalTrackerContext } from '../contexts/EvalTrackerContext.svelte';
import { toRatingSchemeEntry } from '../utils/ratingSchemeEntries';
import { evaluation, linePersonnel, scheme } from '../utils/ratingSchemeLineTestData';
import EvalTrackerViewTestHost from './EvalTrackerViewTestHost.svelte';

const shown = vi.hoisted(() => ({ url: new URL('https://app.test/org/org-1/evals') }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return shown.url;
		},
		state: {}
	}
}));

const schemes = [scheme('scheme-watanabe')];
const evaluations = [evaluation('eval-1', 'scheme-watanabe', { workflowStatus: 'with-rater' })];

function renderTracker() {
	const modals = new ModalRegistry();
	const ctx = new EvalTrackerContext(
		{ orgId: 'org-1', orgName: 'Test Org', personnelLookup: linePersonnel },
		modals,
		createClientAccess({
			membershipRole: 'member',
			capabilityMap: { ...createCapabilityMap('none'), ratingScheme: 'operate' }
		}),
		{
			entries: { items: evaluations.map((row) => toRatingSchemeEntry(schemes[0], row)) },
			schemes: { items: schemes },
			evaluations: { items: evaluations }
		}
	);
	render(EvalTrackerViewTestHost, { props: { ctx } });
	return modals;
}

beforeEach(() => {
	stubToolbarWidths();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	shown.url = new URL('https://app.test/org/org-1/evals');
});

describe('EvalTrackerView', () => {
	it('opens the Evaluation a link names even when the tracker mounts after the page has loaded', () => {
		shown.url = new URL('https://app.test/org/org-1/evals?entry=eval-1');

		const modals = renderTracker();

		expect(screen.getByRole('row', { name: /Open evaluation for/ })).toBeTruthy();
		expect(modals.payload(EVALUATION_SHEET_MODAL)).toEqual({ evaluationId: 'eval-1', fromUrl: true });
	});
});

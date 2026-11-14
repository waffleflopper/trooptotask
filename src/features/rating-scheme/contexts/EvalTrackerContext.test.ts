import { describe, expect, it } from 'vitest';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { Evaluation, RatingScheme } from '../rating-scheme.types';
import { toRatingSchemeEntry } from '../utils/ratingSchemeEntries';
import { evaluation, linePersonnel, scheme } from '../utils/ratingSchemeLineTestData';
import { EvalTrackerContext } from './EvalTrackerContext.svelte';

const schemes: RatingScheme[] = [
	scheme('scheme-watanabe'),
	scheme('scheme-park', { ratedPersonId: 'park', raterPersonId: 'reyes' })
];
const evaluations: Evaluation[] = [
	evaluation('open', 'scheme-watanabe', { workflowStatus: 'with-rater' }),
	evaluation('signed', 'scheme-park', {
		ratedPersonId: 'park',
		workflowStatus: 'completed',
		ratingPeriodEnd: '2025-12-31'
	})
];

function tracker(ratingScheme: 'view' | 'operate' = 'operate') {
	const modals = new ModalRegistry();
	const entries = evaluations.map((row) => toRatingSchemeEntry(schemes.find((s) => s.id === row.ratingSchemeId)!, row));
	const ctx = new EvalTrackerContext(
		{ orgId: 'org-1', orgName: 'Test Org', personnelLookup: linePersonnel },
		modals,
		createClientAccess({ membershipRole: 'member', capabilityMap: { ...createCapabilityMap('none'), ratingScheme } }),
		undefined,
		{ entries: { items: entries }, schemes: { items: schemes }, evaluations: { items: evaluations } }
	);
	return { ctx, modals };
}

const at = (search: string) => new URL(`https://app.test/org/org-1/evals${search}`);

describe('EvalTrackerContext', () => {
	it('lists work in progress and offers a scheme whose last Evaluation completed as ready to start', () => {
		const { ctx } = tracker();

		expect(ctx.rows.map((row) => row.id)).toEqual(['open']);
		expect(ctx.ready.map((row) => row.scheme.id)).toEqual(['scheme-park']);

		ctx.view.status = 'all';
		expect(ctx.rows.map((row) => row.id)).toEqual(['open', 'signed']);
	});

	it('hides Ready to start under a step filter, since those schemes have no step', () => {
		const { ctx } = tracker();

		ctx.view.stepFilter = 'with-rater';

		expect(ctx.rows.map((row) => row.id)).toEqual(['open']);
		expect(ctx.ready).toEqual([]);
	});

	it('opens the Evaluation an address names, and closes it when Back leaves that address', () => {
		const { ctx } = tracker();

		ctx.followAddress(at('?entry=open'));
		expect(ctx.sheet).toEqual({ evaluationId: 'open', fromUrl: true });

		ctx.followAddress(at(''));
		expect(ctx.sheet).toBeUndefined();
	});

	it('keeps a sheet opened from a row when the address changes', () => {
		const { ctx } = tracker();

		ctx.openEvaluation('open');
		ctx.followAddress(at('?tab=x'));

		expect(ctx.sheet?.evaluationId).toBe('open');
	});

	it('opens Start evaluation on the scheme a link names', () => {
		const { ctx } = tracker();

		ctx.followAddress(at('?start=scheme-park'));

		expect(ctx.start).toEqual({ ratingSchemeId: 'scheme-park', fromUrl: true });
	});

	it('does not open either sheet for a viewer who may not edit', () => {
		const { ctx } = tracker('view');

		ctx.followAddress(at('?entry=open&start=scheme-park'));

		expect(ctx.sheet).toBeUndefined();
		expect(ctx.start).toBeUndefined();
	});
});

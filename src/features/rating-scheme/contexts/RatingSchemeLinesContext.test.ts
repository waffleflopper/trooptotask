import { describe, expect, it } from 'vitest';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { line, linePersonnel } from '../utils/ratingSchemeLineTestData';
import { LINE_SHEET_MODAL, RatingSchemeLinesContext, type LineSheetPayload } from './RatingSchemeLinesContext.svelte';

function scheme(ratingScheme: 'view' | 'operate' = 'operate') {
	const modals = new ModalRegistry();
	const ctx = new RatingSchemeLinesContext(
		{ orgId: 'org-1', orgName: 'Test Org', personnelLookup: linePersonnel },
		modals,
		createClientAccess({ membershipRole: 'member', capabilityMap: { ...createCapabilityMap('none'), ratingScheme } }),
		undefined,
		{ items: [line('scheme-1')] },
		{ items: [] }
	);
	return { ctx, open: () => modals.payload<LineSheetPayload>(LINE_SHEET_MODAL) };
}

const at = (search: string) => new URL(`https://app.test/org/org-1/evals/rating-scheme${search}`);

describe('RatingSchemeLinesContext address', () => {
	it('opens the line a link from an Evaluation names, and closes it on Back', () => {
		const { ctx, open } = scheme();

		ctx.followAddress(at('?line=scheme-1'));
		expect(open()?.lineId).toBe('scheme-1');

		ctx.followAddress(at(''));
		expect(open()).toBeUndefined();
	});

	it('ignores a line that is not on the scheme, and a viewer who may not edit', () => {
		const unknown = scheme();
		unknown.ctx.followAddress(at('?line=missing'));
		expect(unknown.open()).toBeUndefined();

		const viewer = scheme('view');
		viewer.ctx.followAddress(at('?line=scheme-1'));
		expect(viewer.open()).toBeUndefined();
	});
});

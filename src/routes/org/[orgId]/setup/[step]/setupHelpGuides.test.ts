import { describe, expect, it } from 'vitest';
import { HELP_GUIDES } from '$features/help';
import { SETUP_EMBEDS, splitStepTarget } from '$features/help/contracts';
import { SETUP_STEPS } from '$features/organization/contracts';

const setupPaths = new Set(SETUP_STEPS.map((step) => `setup/${step.slug}`));
const isSetupPath = (key: string) => key.startsWith('setup/') && !key.includes('[');

describe('Help guides for Setup pages', () => {
	it('name only Setup steps that exist', () => {
		const unknown = HELP_GUIDES.flatMap((guide) => [
			...guide.routes.filter((route) => isSetupPath(route) && !setupPaths.has(route)),
			...guide.steps
				.map((step) => (step.to === undefined ? '' : splitStepTarget(step.to).key))
				.filter((key) => isSetupPath(key) && !setupPaths.has(key))
		]);
		expect(unknown).toEqual([]);
	});

	it('are listed on at least one Setup step', () => {
		const onSetup = HELP_GUIDES.filter((guide) => guide.routes.some(isSetupPath)).map((guide) => guide.id);
		expect(onSetup).toContain('add-assignment-types');
		expect(onSetup).toContain('invite-members');
	});

	it('embed only Setup steps that exist', () => {
		expect(Object.keys(SETUP_EMBEDS).filter((path) => !setupPaths.has(path))).toEqual([]);
	});
});

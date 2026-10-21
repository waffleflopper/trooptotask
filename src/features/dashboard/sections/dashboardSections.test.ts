import { describe, expect, it } from 'vitest';
import { parseDisabledFeatures } from '$lib/access/featureSwitches';
import { activeDashboardSections } from './dashboardSections';
import { DASHBOARD_SECTIONS } from './dashboardSectionRegistry';

describe('activeDashboardSections', () => {
	it('keeps every section in page order when the unit has stored no switches', () => {
		const active = activeDashboardSections(DASHBOARD_SECTIONS, parseDisabledFeatures(null));

		expect(active.map((entry) => entry.id)).toEqual([
			'availability',
			'training',
			'criticalTasks',
			'evaluations',
			'lossesAndAwards',
			'onboarding'
		]);
	});

	it('drops only the switched-off sections and never Availability', () => {
		const active = activeDashboardSections(DASHBOARD_SECTIONS, ['evaluations', 'onboarding']);

		expect(active.map((entry) => entry.id)).toEqual(['availability', 'training', 'criticalTasks', 'lossesAndAwards']);
	});
});

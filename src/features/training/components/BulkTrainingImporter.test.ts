// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import BulkTrainingImporter from './BulkTrainingImporter.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';

const personnel: Personnel[] = [
	{
		id: 'person-1',
		rank: 'SSgt',
		lastName: 'Smith',
		firstName: 'John',
		mos: '4N0X1',
		clinicRole: 'Instructor',
		groupId: null,
		groupName: 'Headquarters'
	}
];

const trainingTypes: TrainingType[] = [
	{
		id: 'training-1',
		name: 'CPR/BLS',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#2563eb',
		sortOrder: 1,
		expirationDateOnly: false,
		canBeExempted: true,
		exemptPersonnelIds: [],
		isOptional: false
	}
];

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('BulkTrainingImporter', () => {
	it('constrains the dialog height so the body scrolls separately from footer actions', () => {
		render(BulkTrainingImporter, {
			orgId: 'org-1',
			personnel,
			trainingTypes,
			onImportComplete: () => {},
			onClose: () => {}
		});

		const dialog = screen.getByRole('dialog', { name: 'Bulk Training Import' });
		const body = dialog.querySelector('[data-slot="app-dialog-body"]');
		const footer = dialog.querySelector('[data-slot="app-dialog-footer"]');

		expect(dialog.getAttribute('class')).toContain('h-[min(42rem,calc(100dvh-2rem))]');
		expect(body?.getAttribute('class')).toContain('min-h-0');
		expect(body?.getAttribute('class')).toContain('overflow-y-auto');
		expect(footer).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
	});
});

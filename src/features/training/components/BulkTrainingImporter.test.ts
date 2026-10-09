// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/training.types';
import BulkTrainingImporter from './BulkTrainingImporter.svelte';

const person = {
	id: 'person-1',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'John',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: null,
	groupName: ''
} as Personnel;

const trainingType: TrainingType = {
	id: 'type-1',
	name: 'CPR',
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
	color: '#22c55e',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('BulkTrainingImporter', () => {
	it('refreshes imported records when its results are dismissed with Escape', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ inserted: [{ id: 'record-1' }], updated: [], exempted: [], errors: [] }))
		);
		const onImportComplete = vi.fn();
		const onClose = vi.fn();
		render(BulkTrainingImporter, {
			props: { orgId: 'org-a', personnel: [person], trainingTypes: [trainingType], onImportComplete, onClose }
		});
		await fireEvent.input(screen.getByLabelText('CSV data'), {
			target: { value: 'Last Name,First Name,Training Type,Date / Status,Notes\nSmith,John,CPR,2026-01-15,' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
		await screen.findByRole('button', { name: 'Done' });

		await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onImportComplete).toHaveBeenCalledTimes(1);
	});
});

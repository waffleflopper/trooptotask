// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { TrainingType } from '$features/training';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import TrainingRecordQuickAdd from './TrainingRecordQuickAdd.svelte';

afterEach(cleanup);

const type = (id: string, name: string, sortOrder: number, archivedAt: string | null): TrainingType => ({
	id,
	name,
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
	color: '#000000',
	sortOrder,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false,
	archivedAt
});

function open(trainingTypes: TrainingType[]) {
	const model = {
		data: { orgId: 'org-1', dashboard: { data: { trainingTypes } } },
		inputs: {
			personnel: [{ id: 'person-1', rank: 'SPC', lastName: 'Able', firstName: 'Synthetic', groupId: 'alpha' }],
			groups: []
		}
	} as unknown as DashboardScreenModel;
	return render(TrainingRecordQuickAdd, {
		props: {
			model,
			access: { can: () => true, isPrivileged: false },
			onClose: vi.fn(),
			updates: { putRecord: vi.fn(), refreshSummary: vi.fn() }
		} as never
	});
}

describe('TrainingRecordQuickAdd', () => {
	it('offers active trainings in catalog order and leaves archived ones out', async () => {
		open([
			type('sharp', 'SHARP', 2, null),
			type('old', 'Old course', 0, '2030-01-02T03:04:05Z'),
			type('cpr', 'CPR', 1, null)
		]);

		await fireEvent.click(screen.getByRole('button', { name: 'Training' }));

		expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(['CPR', 'SHARP']);
	});
});

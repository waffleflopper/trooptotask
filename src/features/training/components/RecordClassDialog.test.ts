// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '../training.types';
import RecordClassDialog from './RecordClassDialog.svelte';

vi.mock('$lib/components/ui/date-picker', async () => ({
	DatePicker: (await import('$features/calendar/test-support/DatePickerInputStub.svelte')).default
}));

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SPC', lastName, firstName: 'Ana', mos: '', clinicRole: '', groupId: null, groupName: '' };
}

const cpr: TrainingType = {
	id: 'cpr',
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

const people = [person('p-okafor', 'Okafor'), person('p-brooks', 'Brooks'), person('p-liang', 'Liang')];

function open(props: { trainingType?: TrainingType; onSave?: ReturnType<typeof vi.fn> } = {}) {
	const onSave = props.onSave ?? vi.fn().mockResolvedValue(undefined);
	const onClose = vi.fn();
	render(RecordClassDialog, {
		props: { trainingType: props.trainingType ?? cpr, people, today: '2026-10-21', onSave, onClose }
	});
	return { onSave, onClose };
}

afterEach(cleanup);

describe('RecordClassDialog', () => {
	it('records the checked people on the chosen completion date in one save, then closes', async () => {
		const { onSave, onClose } = open();
		expect((screen.getByLabelText('Completion date') as HTMLInputElement).value).toBe('2026-10-21');

		await fireEvent.click(screen.getByLabelText('SPC Brooks, Ana'));
		await fireEvent.input(screen.getByLabelText('Completion date'), { target: { value: '2026-10-20' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Record 2' }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onSave.mock.calls).toEqual([
			[
				[
					{ personnelId: 'p-okafor', trainingTypeId: 'cpr', completionDate: '2026-10-20', status: 'completed' },
					{ personnelId: 'p-liang', trainingTypeId: 'cpr', completionDate: '2026-10-20', status: 'completed' }
				]
			]
		]);
	});

	it('stays open with the failure message and saves again on retry', async () => {
		const onSave = vi
			.fn()
			.mockRejectedValueOnce(new Error('Liang: not assigned to this unit'))
			.mockResolvedValue(undefined);
		const { onClose } = open({ onSave });

		await fireEvent.click(screen.getByRole('button', { name: 'Record 3' }));

		expect(await screen.findByText('Liang: not assigned to this unit')).toBeTruthy();
		expect(onClose).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Record 3' }));
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onSave).toHaveBeenCalledTimes(2);
	});

	it('asks for the expiration date with no default for an expiration-date-only type', async () => {
		const { onSave } = open({ trainingType: { ...cpr, expirationMonths: null, expirationDateOnly: true } });
		const save = screen.getByRole('button', { name: 'Record 3' }) as HTMLButtonElement;

		expect((screen.getByLabelText('Expiration date') as HTMLInputElement).value).toBe('');
		expect(save.disabled).toBe(true);
		await fireEvent.input(screen.getByLabelText('Expiration date'), { target: { value: '2027-03-01' } });
		await fireEvent.click(save);

		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		expect(onSave.mock.calls[0][0].map((record: { completionDate: string }) => record.completionDate)).toEqual([
			'2027-03-01',
			'2027-03-01',
			'2027-03-01'
		]);
	});

	it('cannot save once everyone is unchecked', async () => {
		open();
		for (const name of ['SPC Okafor, Ana', 'SPC Brooks, Ana', 'SPC Liang, Ana']) {
			await fireEvent.click(screen.getByLabelText(name));
		}
		expect((screen.getByRole('button', { name: 'Record 0' }) as HTMLButtonElement).disabled).toBe(true);
	});
});

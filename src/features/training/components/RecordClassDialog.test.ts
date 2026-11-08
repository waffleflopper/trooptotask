// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { RecordClassCandidate, RecordClassGroupFilter, TrainingBatchRecord } from '../contracts';
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
	isOptional: false,
	archivedAt: null
};

const people: RecordClassCandidate[] = [
	{ person: person('p-okafor', 'Okafor'), statusLabel: null, checked: true },
	{ person: person('p-brooks', 'Brooks'), statusLabel: null, checked: true },
	{ person: person('p-liang', 'Liang'), statusLabel: null, checked: true }
];

type SaveRecords = (records: TrainingBatchRecord[]) => Promise<void>;

function open(
	props: {
		trainingType?: TrainingType;
		onSave?: Mock<SaveRecords>;
		candidates?: RecordClassCandidate[];
		groupFilter?: RecordClassGroupFilter;
	} = {}
) {
	const onSave = props.onSave ?? vi.fn<SaveRecords>().mockResolvedValue(undefined);
	const onClose = vi.fn();
	render(RecordClassDialog, {
		props: {
			trainingType: props.trainingType ?? cpr,
			candidates: props.candidates ?? people,
			groupFilter: props.groupFilter,
			today: '2026-10-21',
			onSave,
			onClose
		}
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
		expect(onSave.mock.calls[0][0].map((record) => record.completionDate)).toEqual([
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

	it('lists each Soldier with their status, checking only those the caller checked', async () => {
		const { onSave } = open({
			candidates: [
				{ person: person('p-okafor', 'Okafor'), statusLabel: 'Expired 5d ago', checked: true },
				{ person: person('p-brooks', 'Brooks'), statusLabel: 'Current', checked: false }
			]
		});

		expect(screen.getByLabelText(/SPC Okafor, Ana\s+Expired 5d ago/)).toBeTruthy();
		expect((screen.getByLabelText(/SPC Brooks, Ana\s+Current/) as HTMLInputElement).getAttribute('aria-checked')).toBe(
			'false'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Record 1' }));

		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		expect(onSave.mock.calls[0][0].map((record) => record.personnelId)).toEqual(['p-okafor']);
	});

	describe('Group filter', () => {
		const groups: Record<string, string[]> = { alpha: ['p-okafor', 'p-brooks'], bravo: ['p-liang'] };
		const groupFilter: RecordClassGroupFilter = {
			options: [
				{ value: '', label: 'All Groups' },
				{ value: 'alpha', label: 'Alpha' },
				{ value: 'bravo', label: 'Bravo' }
			],
			initial: 'alpha',
			personnelIdsIn: (groupId) => new Set(groups[groupId] ?? [])
		};

		it('opens on the given Group and records only the checked Soldiers in view', async () => {
			const { onSave } = open({ groupFilter });

			expect((screen.getByLabelText('Group') as HTMLSelectElement).value).toBe('alpha');
			expect(screen.queryByLabelText('SPC Liang, Ana')).toBeNull();
			await fireEvent.click(screen.getByLabelText('SPC Brooks, Ana'));
			await fireEvent.click(screen.getByRole('button', { name: 'Record 1' }));

			await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
			expect(onSave.mock.calls[0][0].map((record) => record.personnelId)).toEqual(['p-okafor']);
		});

		it('lists everyone again, and keeps earlier choices, when the Group changes', async () => {
			const { onSave } = open({ groupFilter });

			await fireEvent.click(screen.getByLabelText('SPC Brooks, Ana'));
			await fireEvent.change(screen.getByLabelText('Group'), { target: { value: '' } });
			expect(screen.getByLabelText('SPC Liang, Ana')).toBeTruthy();
			await fireEvent.click(screen.getByRole('button', { name: 'Record 2' }));

			await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
			expect(onSave.mock.calls[0][0].map((record) => record.personnelId)).toEqual(['p-okafor', 'p-liang']);
		});
	});
});

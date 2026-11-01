// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { createTrainingRecord } from '$features/training/index.server';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import TrainingMatrix from './TrainingMatrix.svelte';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'http://service.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'anon'
}));
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('$lib/components/ui/date-picker', async () => ({
	DatePicker: (await import('$features/calendar/test-support/DatePickerInputStub.svelte')).default
}));

const PERSON = '00000000-0000-4000-8000-000000005001';
const MONTHS_TYPE = '00000000-0000-4000-8000-000000005002';
const CARD_TYPE = '00000000-0000-4000-8000-000000005003';
const RECORD = '00000000-0000-4000-8000-000000005004';

const person: Personnel = {
	id: PERSON,
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: null,
	groupName: ''
};

function typeOf(overrides: Partial<TrainingType>): TrainingType {
	return {
		id: MONTHS_TYPE,
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
		...overrides
	};
}

function mountAgainstStore(seed: {
	type: TrainingType;
	stored: Record<string, unknown>;
	training: Omit<PersonnelTraining, 'id' | 'personnelId' | 'trainingTypeId'>;
}) {
	const ctx = createTestContext();
	ctx.store.seed('personnel', [{ id: PERSON, organization_id: ctx.auth.orgId, group_id: null }]);
	ctx.store.seed('training_types', [
		{
			id: seed.type.id,
			organization_id: ctx.auth.orgId,
			expiration_months: seed.type.expirationMonths,
			expiration_date_only: seed.type.expirationDateOnly
		}
	]);
	ctx.store.seed('personnel_trainings', [
		{
			id: RECORD,
			organization_id: ctx.auth.orgId,
			personnel_id: PERSON,
			training_type_id: seed.type.id,
			...seed.stored
		}
	]);
	const onRecord = vi.fn(async (data: Omit<PersonnelTraining, 'id'>) => {
		await createTrainingRecord(ctx, JSON.parse(JSON.stringify(data)));
	});
	render(TrainingMatrix, {
		props: {
			title: 'All trainings',
			orgId: ctx.auth.orgId,
			asOf: '2026-10-25',
			goalPercent: 90,
			personnel: [person],
			trainingTypes: [seed.type],
			trainings: [{ id: RECORD, personnelId: PERSON, trainingTypeId: seed.type.id, ...seed.training }],
			onRecord
		}
	});
	const stored = async () => (await ctx.trainingCompletions.listPersonCompletions(PERSON))[0];
	return { onRecord, stored };
}

async function openPopoverOn(label: string): Promise<HTMLElement> {
	await fireEvent.click(screen.getByRole('button', { name: label }));
	return (await screen.findByText(/^Record · /)).closest('form') as HTMLElement;
}

afterEach(cleanup);

describe('Recording from the matrix against stored records', () => {
	it('keeps the stored note and certificate link when only the date changes', async () => {
		const user = userEvent.setup();
		const { onRecord, stored } = mountAgainstStore({
			type: typeOf({}),
			stored: {
				completion_date: '2026-06-15',
				expiration_date: '2027-06-15',
				notes: 'Range card',
				certificate_url: 'https://example.test/cpr.pdf'
			},
			training: {
				completionDate: '2026-06-15',
				expirationDate: '2027-06-15',
				notes: 'Range card',
				certificateUrl: 'https://example.test/cpr.pdf'
			}
		});

		const popover = await openPopoverOn('Smith CPR: Current');
		await fireEvent.input(within(popover).getByLabelText('Completed'), { target: { value: '2026-10-20' } });
		await user.click(within(popover).getByRole('button', { name: /^Save/ }));

		await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
		expect(await stored()).toMatchObject({
			completionDate: '2026-10-20',
			expirationDate: '2027-10-20',
			notes: 'Range card',
			certificateUrl: 'https://example.test/cpr.pdf'
		});
	});

	it('keeps an uploaded certificate when only a note is added', async () => {
		const user = userEvent.setup();
		const uploaded = 'test-org/personnel/smith/training-certificates/abc/cpr.pdf';
		const { onRecord, stored } = mountAgainstStore({
			type: typeOf({}),
			stored: {
				completion_date: '2026-06-15',
				expiration_date: '2027-06-15',
				notes: null,
				certificate_url: uploaded
			},
			training: {
				completionDate: '2026-06-15',
				expirationDate: '2027-06-15',
				notes: null,
				certificateUrl: uploaded
			}
		});

		const popover = await openPopoverOn('Smith CPR: Current');
		await user.click(within(popover).getByRole('button', { name: /^Add a note/ }));
		await user.type(within(popover).getByLabelText('Notes'), 'Renewed on site');
		await user.click(within(popover).getByRole('button', { name: /^Save/ }));

		await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
		expect(await stored()).toMatchObject({ notes: 'Renewed on site', certificateUrl: uploaded });
	});

	it('keeps the stored completion date when a card date is recorded', async () => {
		const user = userEvent.setup();
		const { onRecord, stored } = mountAgainstStore({
			type: typeOf({ id: CARD_TYPE, name: 'Card', expirationMonths: null, expirationDateOnly: true }),
			stored: { completion_date: '2026-01-05', expiration_date: '2027-01-05', notes: null, certificate_url: null },
			training: { completionDate: '2026-01-05', expirationDate: '2027-01-05', notes: null, certificateUrl: null }
		});

		const popover = await openPopoverOn('Smith Card: Current');
		await fireEvent.input(within(popover).getByLabelText('Expires on'), { target: { value: '2029-03-09' } });
		await user.click(within(popover).getByRole('button', { name: /^Save/ }));

		await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
		expect(await stored()).toMatchObject({ completionDate: '2026-01-05', expirationDate: '2029-03-09' });
	});
});

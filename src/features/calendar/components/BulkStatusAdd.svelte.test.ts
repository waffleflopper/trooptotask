// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import { toastStore } from '$lib/stores/toast.svelte';
import BulkStatusAdd from './BulkStatusAdd.svelte';

vi.mock('$lib/components/ui/date-picker', async () => ({
	DatePicker: (await import('../test-support/DatePickerInputStub.svelte')).default
}));

const personnel: Personnel[] = [
	{
		id: 'person-able',
		rank: 'SPC',
		lastName: 'Able',
		firstName: 'Ann',
		mos: '68W',
		clinicRole: '',
		groupId: 'alpha',
		groupName: 'Alpha'
	},
	{
		id: 'person-baker',
		rank: 'SPC',
		lastName: 'Baker',
		firstName: 'Bea',
		mos: '68W',
		clinicRole: '',
		groupId: 'alpha',
		groupName: 'Alpha'
	}
];

const statusTypes: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#166534', textColor: '#ffffff' },
	{ id: 'training', name: 'Training', color: '#2563eb', textColor: '#ffffff' }
];

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it('preserves the partial draft and retries only the failed Person before refreshing', async () => {
	vi.spyOn(toastStore, 'error').mockImplementation(() => 'error-toast');
	vi.spyOn(toastStore, 'success').mockImplementation(() => 'success-toast');
	const onApply = vi.fn().mockResolvedValueOnce(['person-able']).mockResolvedValueOnce(['person-baker']);
	const onComplete = vi.fn();

	render(BulkStatusAdd, {
		props: {
			personnelByGroup: [{ group: 'Alpha', personnel }],
			statusTypes,
			onApply,
			onComplete
		}
	});

	await fireEvent.change(screen.getByLabelText('Status Type'), { target: { value: 'training' } });
	await fireEvent.input(screen.getByLabelText('Start Date'), { target: { value: '2026-09-22' } });
	await fireEvent.input(screen.getByLabelText('End Date'), { target: { value: '2026-09-24' } });
	await fireEvent.input(screen.getByLabelText('Note'), { target: { value: '  Retry without duplicates  ' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Select shown' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Review & Confirm' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }));

	const retry = await screen.findByRole('button', { name: 'Review & Confirm' });
	expect(onComplete).not.toHaveBeenCalled();
	expect(screen.getByRole('checkbox', { name: 'Select SPC Able, Ann' }).getAttribute('aria-checked')).toBe('false');
	expect(screen.getByRole('checkbox', { name: 'Select SPC Baker, Bea' }).getAttribute('aria-checked')).toBe('true');
	expect((screen.getByLabelText('Status Type') as HTMLSelectElement).value).toBe('training');
	expect((screen.getByLabelText('Start Date') as HTMLInputElement).value).toBe('2026-09-22');
	expect((screen.getByLabelText('End Date') as HTMLInputElement).value).toBe('2026-09-24');
	expect((screen.getByLabelText('Note') as HTMLInputElement).value).toBe('  Retry without duplicates  ');
	expect((retry as HTMLButtonElement).disabled).toBe(false);

	await fireEvent.click(retry);
	expect(screen.queryByText('Able, Ann')).toBeNull();
	expect(screen.getByText('Baker, Bea')).toBeTruthy();
	await fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }));

	await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
	expect(onApply).toHaveBeenCalledTimes(2);
	expect(onApply).toHaveBeenNthCalledWith(
		1,
		['person-able', 'person-baker'],
		'training',
		'2026-09-22',
		'2026-09-24',
		'Retry without duplicates'
	);
	expect(onApply).toHaveBeenNthCalledWith(
		2,
		['person-baker'],
		'training',
		'2026-09-22',
		'2026-09-24',
		'Retry without duplicates'
	);
	expect((screen.getByRole('button', { name: 'Review & Confirm' }) as HTMLButtonElement).disabled).toBe(true);
});

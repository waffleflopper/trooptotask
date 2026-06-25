// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PersonnelModal from './PersonnelModal.svelte';
import { toastStore } from '$lib/stores/toast.svelte';

afterEach(async () => {
	cleanup();
	// bits-ui schedules dialog body-scroll cleanup with a 24ms delay.
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.restoreAllMocks();
});

describe('PersonnelModal', () => {
	it('labels the personnel position field as Duty Role', () => {
		render(PersonnelModal, {
			props: {
				groups: [],
				onSubmit: vi.fn(),
				onClose: vi.fn()
			}
		});

		expect(screen.getByLabelText('Duty Role')).toBeTruthy();
	});

	it('keeps the modal open when async submit fails', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockRejectedValue(new Error('insert blocked by policy'));
		const errorSpy = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(PersonnelModal, {
			props: {
				groups: [],
				onSubmit,
				onClose
			}
		});

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(1);
			expect(onClose).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalledWith('insert blocked by policy');
		});
	});

	it('includes ETS and PCS / DEROS values in the submitted personnel payload', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockResolvedValue(undefined);

		render(PersonnelModal, {
			props: {
				personnel: {
					id: 'person-1',
					rank: 'SPC',
					firstName: 'Jane',
					lastName: 'Smith',
					mos: '',
					clinicRole: '',
					ets: '2027-05-01',
					deros: '2026-11-30',
					groupId: null,
					groupName: ''
				},
				groups: [],
				onSubmit,
				onClose
			}
		});

		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({
					ets: '2027-05-01',
					deros: '2026-11-30'
				})
			);
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	it('submits blank ETS and PCS / DEROS fields as null', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockResolvedValue(undefined);

		render(PersonnelModal, {
			props: {
				groups: [],
				onSubmit,
				onClose
			}
		});

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({
					ets: null,
					deros: null
				})
			);
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});

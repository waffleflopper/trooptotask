// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PersonnelModal from './PersonnelModal.svelte';
import { toastStore } from '$lib/stores/toast.svelte';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('PersonnelModal', () => {
	it('keeps the modal open when async submit fails', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockRejectedValue(new Error('insert blocked by policy'));
		const errorSpy = vi.spyOn(toastStore, 'error').mockImplementation(() => {});

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
});

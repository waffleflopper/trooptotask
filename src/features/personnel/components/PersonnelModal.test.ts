// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PersonnelModal from './PersonnelModal.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { RankCatalogEntry } from '$features/personnel/contracts';

afterEach(async () => {
	cleanup();
	// bits-ui schedules dialog body-scroll cleanup with a 24ms delay.
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.restoreAllMocks();
});

describe('PersonnelModal', () => {
	const armyRankCatalog: RankCatalogEntry[] = [
		{
			code: 'ADM',
			label: 'Admiral',
			service: 'navy',
			category: 'officer',
			payGrade: 'O-10',
			state: 'active',
			sortOrder: 0
		},
		{
			code: 'SPC',
			label: 'Specialist',
			service: 'army',
			category: 'enlisted',
			payGrade: 'E-4',
			state: 'active',
			sortOrder: 1
		}
	];
	const navyRankCatalog: RankCatalogEntry[] = [
		{
			code: 'PO3',
			label: 'Petty Officer Third Class',
			service: 'navy',
			category: 'enlisted',
			payGrade: 'E-4',
			state: 'active',
			sortOrder: 0
		}
	];

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

	it('defaults new Personnel to SPC when the common rank is available', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockResolvedValue(undefined);

		render(PersonnelModal, {
			props: {
				groups: [],
				rankCatalog: armyRankCatalog,
				onSubmit,
				onClose
			}
		});

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Nolan' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Avery' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rank: 'SPC' }));
		});
	});

	it('defaults new Personnel to the catalog-cased SPC option when catalog casing differs', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockResolvedValue(undefined);

		render(PersonnelModal, {
			props: {
				groups: [],
				rankCatalog: [{ ...armyRankCatalog[1], code: 'spc', label: 'Specialist' }],
				onSubmit,
				onClose
			}
		});

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Nolan' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Avery' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rank: 'spc' }));
		});
	});

	it('requires explicit rank selection when no common default is available', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockResolvedValue(undefined);

		render(PersonnelModal, {
			props: {
				groups: [],
				rankCatalog: navyRankCatalog,
				onSubmit,
				onClose
			}
		});

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Nolan' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Avery' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		expect(screen.getByText('Select a rank.')).toBeTruthy();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('keeps the modal open when async submit fails', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockRejectedValue(new Error('insert blocked by policy'));
		const errorSpy = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(PersonnelModal, {
			props: {
				groups: [],
				rankCatalog: armyRankCatalog,
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
				rankCatalog: armyRankCatalog,
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

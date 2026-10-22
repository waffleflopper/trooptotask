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

	it('locks the draft while a submit is held and unlocks it with the draft after a failure', async () => {
		let rejectSubmit!: (error: Error) => void;
		const onSubmit = vi.fn(
			() =>
				new Promise<void>((_, reject) => {
					rejectSubmit = reject;
				})
		);
		vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
		const inDisabledGroup = (control: HTMLElement) => control.closest('fieldset')?.disabled === true;
		render(PersonnelModal, { props: { groups: [], rankCatalog: armyRankCatalog, onSubmit, onClose: vi.fn() } });
		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		const dialog = screen.getByRole('dialog', { name: 'Add Personnel' });
		await waitFor(() => expect(dialog.getAttribute('aria-busy')).toBe('true'));
		for (const label of [/Last Name/i, /First Name/i, /MOS/i, /^ETS$/]) {
			expect(inDisabledGroup(screen.getByLabelText(label))).toBe(true);
		}

		rejectSubmit(new Error('Save denied'));

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		const lastName = screen.getByLabelText(/Last Name/i) as HTMLInputElement;
		expect(lastName.value).toBe('Smith');
		expect(inDisabledGroup(lastName)).toBe(false);
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

	const editedPerson = {
		id: 'person-1',
		rank: 'SPC',
		firstName: 'Jane',
		lastName: 'Smith',
		mos: '68W',
		clinicRole: '',
		ets: null,
		deros: null,
		groupId: null,
		groupName: ''
	};

	function describedText(control: HTMLElement) {
		return (control.getAttribute('aria-describedby') ?? '')
			.split(' ')
			.map((id) => document.getElementById(id)?.textContent)
			.join(' ')
			.trim();
	}

	it('ties an Edit name error to the cleared field and leaves valid fields unmarked', async () => {
		const onSubmit = vi.fn();
		render(PersonnelModal, {
			props: { personnel: editedPerson, groups: [], rankCatalog: armyRankCatalog, onSubmit, onClose: vi.fn() }
		});

		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: '   ' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		const firstName = screen.getByLabelText(/First Name/i);
		expect(firstName.getAttribute('aria-invalid')).toBe('true');
		expect(describedText(firstName)).toBe('Enter a first name.');
		expect(screen.getByLabelText(/Last Name/i).getAttribute('aria-invalid')).toBeNull();
		expect(onSubmit).not.toHaveBeenCalled();

		await fireEvent.input(firstName, { target: { value: 'Jane' } });
		expect(firstName.getAttribute('aria-invalid')).toBeNull();
		expect(screen.queryByText('Enter a first name.')).toBeNull();
	});

	it('keeps every edited value when saving an Edit is rejected', async () => {
		const onSubmit = vi.fn().mockRejectedValue(new Error('update blocked by policy'));
		vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(PersonnelModal, {
			props: { personnel: editedPerson, groups: [], rankCatalog: armyRankCatalog, onSubmit, onClose: vi.fn() }
		});

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smythe' } });
		await fireEvent.input(screen.getByLabelText(/MOS/i), { target: { value: '68C' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => expect(toastStore.error).toHaveBeenCalledWith('update blocked by policy'));
		expect((screen.getByLabelText(/Last Name/i) as HTMLInputElement).value).toBe('Smythe');
		expect((screen.getByLabelText(/MOS/i) as HTMLInputElement).value).toBe('68C');
		expect((screen.getByLabelText(/First Name/i) as HTMLInputElement).value).toBe('Jane');
	});

	it('ties missing rank and Group errors to their comboboxes', async () => {
		render(PersonnelModal, {
			props: {
				groups: [{ id: 'g-1', name: 'Alpha', sortOrder: 0 }],
				allowUnassigned: false,
				rankCatalog: navyRankCatalog,
				onSubmit: vi.fn(),
				onClose: vi.fn()
			}
		});

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Nolan' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Avery' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		const rank = document.getElementById('rank') as HTMLElement;
		const group = document.getElementById('group') as HTMLElement;
		expect(rank.getAttribute('aria-invalid')).toBe('true');
		expect(describedText(rank)).toBe('Select a rank.');
		expect(group.getAttribute('aria-invalid')).toBe('true');
		expect(describedText(group)).toBe('Select a permitted Group.');
	});
	describe('dismissal with a typed draft', () => {
		function renderOpenModal(onClose = vi.fn()) {
			render(PersonnelModal, {
				props: { groups: [], rankCatalog: armyRankCatalog, onSubmit: vi.fn(), onClose }
			});
			return { onClose, dialog: screen.getByRole('dialog') };
		}

		it('keeps the dialog and the typed values when Escape is pressed with a draft', async () => {
			const { onClose, dialog } = renderOpenModal();
			await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Nolan' } });

			await fireEvent.keyDown(dialog, { key: 'Escape' });

			expect(screen.getByRole('dialog')).toBe(dialog);
			expect((screen.getByLabelText(/Last Name/i) as HTMLInputElement).value).toBe('Nolan');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('closes on Escape when nothing was changed', async () => {
			const { onClose, dialog } = renderOpenModal();

			await fireEvent.keyDown(dialog, { key: 'Escape' });

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes on Escape after the draft is typed back to the opening values', async () => {
			const { onClose, dialog } = renderOpenModal();
			const lastName = screen.getByLabelText(/Last Name/i);
			await fireEvent.input(lastName, { target: { value: 'Nolan' } });
			await fireEvent.input(lastName, { target: { value: '' } });

			await fireEvent.keyDown(dialog, { key: 'Escape' });

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('discards the draft when Cancel is pressed', async () => {
			const { onClose } = renderOpenModal();
			await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Nolan' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('blocks Escape on an edited existing Person', async () => {
			const onClose = vi.fn();
			render(PersonnelModal, {
				props: {
					personnel: {
						id: 'p-1',
						rank: 'SPC',
						lastName: 'Smith',
						firstName: 'John',
						mos: '68W',
						clinicRole: 'Medic',
						ets: null,
						deros: null,
						groupId: null,
						groupName: ''
					},
					groups: [],
					rankCatalog: armyRankCatalog,
					onSubmit: vi.fn(),
					onClose
				}
			});
			const dialog = screen.getByRole('dialog');

			await fireEvent.input(screen.getByLabelText(/MOS/i), { target: { value: '68C' } });
			await fireEvent.keyDown(dialog, { key: 'Escape' });
			expect(onClose).not.toHaveBeenCalled();
			expect((screen.getByLabelText(/MOS/i) as HTMLInputElement).value).toBe('68C');
		});
	});
});

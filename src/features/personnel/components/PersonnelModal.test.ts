// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PersonnelModal from './PersonnelModal.svelte';
import { StoreRequestError } from '$lib/stores/core/ports';
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
		// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
		const inDisabledGroup = (control: HTMLElement) => control.closest('fieldset')?.disabled === true;
		render(PersonnelModal, { props: { groups: [], rankCatalog: armyRankCatalog, onSubmit, onClose: vi.fn() } });
		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		const dialog = screen.getByRole('dialog', { name: 'Add a person' });
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

	it('keeps a failed add in the dialog and resends the same values with Try again', async () => {
		const onClose = vi.fn();
		const onSubmit = vi
			.fn()
			.mockRejectedValueOnce(new StoreRequestError('insert blocked by policy', 403, true))
			.mockResolvedValue(undefined);
		render(PersonnelModal, { props: { groups: [], rankCatalog: armyRankCatalog, onSubmit, onClose } });
		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('insert blocked by policy'));
		expect(onClose).not.toHaveBeenCalled();
		expect((screen.getByLabelText(/Last Name/i) as HTMLInputElement).value).toBe('Smith');

		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onSubmit).toHaveBeenNthCalledWith(2, onSubmit.mock.calls[0][0]);
	});

	it('never resends an add whose outcome the server did not confirm', async () => {
		const onSubmit = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		render(PersonnelModal, { props: { groups: [], rankCatalog: armyRankCatalog, onSubmit, onClose: vi.fn() } });
		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => expect(screen.getByRole('button', { name: 'Reload roster' })).toBeTruthy());
		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
		await fireEvent.submit(document.getElementById('personnel-form')!);
		await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });
		await fireEvent.click(screen.getByRole('button', { name: /add another/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
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

	function describedText(control: HTMLElement) {
		return (control.getAttribute('aria-describedby') ?? '')
			.split(' ')
			.map((id) => document.getElementById(id)?.textContent)
			.join(' ')
			.trim();
	}

	it('ties a name error to the blank field and leaves valid fields unmarked', async () => {
		const onSubmit = vi.fn();
		render(PersonnelModal, { props: { groups: [], rankCatalog: armyRankCatalog, onSubmit, onClose: vi.fn() } });

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
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

	it('ties missing rank and Group errors to their comboboxes', async () => {
		render(PersonnelModal, {
			props: {
				groups: [{ id: 'g-1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }],
				allowUnassigned: false,
				rankCatalog: navyRankCatalog,
				onSubmit: vi.fn(),
				onClose: vi.fn()
			}
		});

		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Nolan' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Avery' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		const rank = document.getElementById('person-rank') as HTMLElement;
		const group = document.getElementById('person-group') as HTMLElement;
		expect(rank.getAttribute('aria-invalid')).toBe('true');
		expect(describedText(rank)).toBe('Select a rank.');
		expect(group.getAttribute('aria-invalid')).toBe('true');
		expect(describedText(group)).toBe('Select a permitted Group.');
	});
	it('warns that an unassigned person is seen only with whole-unit access, until a Group is picked', async () => {
		render(PersonnelModal, {
			props: {
				groups: [{ id: 'g-1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 }],
				allowUnassigned: true,
				rankCatalog: navyRankCatalog,
				onSubmit: vi.fn(),
				onClose: vi.fn()
			}
		});
		const group = () => document.getElementById('person-group') as HTMLElement;
		expect(describedText(group())).toMatch(/whole-unit access/);

		await fireEvent.click(group());
		await fireEvent.click(await screen.findByRole('treeitem', { name: 'Alpha' }));
		await waitFor(() => expect(describedText(group())).not.toMatch(/whole-unit access/));
	});

	it('assigns a team inside a squad from the Group tree and shows its path', async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		render(PersonnelModal, {
			props: {
				groups: [
					{ id: 'plt', name: '2nd Platoon', sortOrder: 0, parentId: null, depth: 1 },
					{ id: 'sq', name: '1st Squad', sortOrder: 0, parentId: 'plt', depth: 2 },
					{ id: 'alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'sq', depth: 3 },
					{ id: 'bravo', name: 'Bravo Team', sortOrder: 1, parentId: 'sq', depth: 3 },
					{ id: 'hq', name: 'HQ', sortOrder: 1, parentId: null, depth: 1 }
				],
				allowUnassigned: true,
				rankCatalog: armyRankCatalog,
				onSubmit,
				onClose: vi.fn()
			}
		});
		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Moss' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Avery' } });

		await fireEvent.click(document.getElementById('person-group') as HTMLElement);
		await fireEvent.input(await screen.findByRole('combobox', { name: 'Search Groups' }), {
			target: { value: 'bravo' }
		});
		await fireEvent.click(screen.getByRole('treeitem', { name: 'Bravo Team' }));

		expect(document.getElementById('person-group')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Group: 2nd Platoon › 1st Squad › Bravo Team'
		);
		await fireEvent.click(screen.getByTestId('personnel-save'));
		await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'bravo' })));
	});

	describe('Add and add another', () => {
		const groups = [{ id: 'g-supply', name: 'Supply section', sortOrder: 0, parentId: null, depth: 1 as const }];

		async function typePerson(lastName: string, firstName: string) {
			await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: lastName } });
			await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: firstName } });
		}

		it('keeps Rank, MOS and Group, clears the rest, counts the adds and refocuses Last name', async () => {
			const onClose = vi.fn();
			const onSubmit = vi.fn().mockResolvedValue(undefined);
			render(PersonnelModal, { props: { groups, rankCatalog: armyRankCatalog, onSubmit, onClose } });
			await typePerson('Alvarez', 'Maria');
			await fireEvent.input(screen.getByLabelText(/MOS/i), { target: { value: '92Y' } });
			await fireEvent.input(screen.getByLabelText(/Duty Role/i), { target: { value: 'Supply clerk' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Group' }));
			await fireEvent.click(await screen.findByRole('treeitem', { name: 'Supply section' }));

			await fireEvent.click(screen.getByRole('button', { name: /Add and add another/ }));

			await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Last Name/i)));
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({ rank: 'SPC', lastName: 'Alvarez', mos: '92Y', groupId: 'g-supply' })
			);
			expect((screen.getByLabelText(/Last Name/i) as HTMLInputElement).value).toBe('');
			expect((screen.getByLabelText(/First Name/i) as HTMLInputElement).value).toBe('');
			expect((screen.getByLabelText(/Duty Role/i) as HTMLInputElement).value).toBe('');
			expect((screen.getByLabelText(/MOS/i) as HTMLInputElement).value).toBe('92Y');
			expect(screen.getByRole('status').textContent).toMatch(/SPC Alvarez\D+1\b/);
			expect(onClose).not.toHaveBeenCalled();

			await typePerson('Okafor', 'Ben');
			await fireEvent.keyDown(screen.getByLabelText(/First Name/i), { key: 'Enter', ctrlKey: true });

			await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/SPC Okafor\D+2\b/));
			expect(onSubmit).toHaveBeenLastCalledWith(
				expect.objectContaining({ rank: 'SPC', lastName: 'Okafor', mos: '92Y', groupId: 'g-supply' })
			);

			await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('focuses the first empty required field instead of adding', async () => {
			const onSubmit = vi.fn();
			render(PersonnelModal, { props: { groups, rankCatalog: armyRankCatalog, onSubmit, onClose: vi.fn() } });

			await fireEvent.click(screen.getByRole('button', { name: /Add and add another/ }));

			expect(document.activeElement).toBe(screen.getByLabelText(/Last Name/i));
			expect(screen.getByLabelText(/Last Name/i).getAttribute('aria-invalid')).toBe('true');
			expect(screen.getByLabelText(/First Name/i).getAttribute('aria-invalid')).toBe('true');
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('adds exactly one person and closes when the caller needs the one person it adds', async () => {
			const onSubmit = vi.fn().mockResolvedValue(undefined);
			const onClose = vi.fn();
			render(PersonnelModal, {
				props: { groups, rankCatalog: armyRankCatalog, addAnother: false, onSubmit, onClose }
			});
			await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
			await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });

			await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });
			expect(onSubmit).not.toHaveBeenCalled();
			expect(screen.queryByRole('button', { name: /add another/i })).toBeNull();

			await fireEvent.click(screen.getByTestId('personnel-save'));
			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
			expect(onSubmit).toHaveBeenCalledTimes(1);
			expect(onSubmit.mock.calls[0][0]).toMatchObject({ lastName: 'Smith', firstName: 'Jane' });
		});
	});

	it('explains an Organization with no Groups instead of offering an empty Group list', () => {
		render(PersonnelModal, {
			props: { groups: [], rankCatalog: armyRankCatalog, onSubmit: vi.fn(), onClose: vi.fn() }
		});

		expect(document.getElementById('person-group')).toBeNull();
		expect(screen.getByText('No Groups yet')).toBeTruthy();
	});

	it('keeps password managers out of the name fields', () => {
		render(PersonnelModal, {
			props: { groups: [], rankCatalog: armyRankCatalog, onSubmit: vi.fn(), onClose: vi.fn() }
		});

		for (const label of [/Last Name/i, /First Name/i]) {
			const input = screen.getByLabelText(label);
			expect(input.getAttribute('autocomplete')).toBe('off');
			expect(input.hasAttribute('data-1p-ignore')).toBe(true);
			expect(input.getAttribute('data-lpignore')).toBe('true');
			expect(input.hasAttribute('data-bwignore')).toBe(true);
		}
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
	});
});

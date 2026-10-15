// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingTypesPage from './TrainingTypesPage.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import { stubToolbarWidths, toolbarDescription } from '$lib/test-support/toolbarWidths';

const viewer = {
	orgId: 'org-1',
	affordanceForFeatureAction: () => ({
		allowed: false,
		visible: true,
		disabled: true,
		reason: 'denied:capability',
		explanation: '',
		decision: {}
	})
} as unknown as import('../contracts').TrainingPageAccess;

const org = {
	orgId: 'org-1',
	orgName: 'Test Unit',
	userId: 'user-1',
	role: 'owner',
	isOwner: true,
	isAdmin: false,
	isPrivileged: true,
	affordanceForFeatureAction: () => ({
		allowed: true,
		visible: true,
		disabled: false,
		reason: 'allowed:capability',
		explanation: '',
		decision: {}
	})
} as unknown as import('../contracts').TrainingPageAccess;

const personnel: Personnel[] = [
	{
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-1',
		groupName: 'Alpha'
	}
] as Personnel[];

const trainingType: TrainingType = {
	id: 'type-1',
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

describe('TrainingTypesPage', () => {
	beforeEach(() => {
		personnelRosterHydration.load(personnel, 'org-1');
		trainingRankCatalogStore.load([], 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		cleanup();
		personnelRosterHydration.load([], 'org-test-reset');
		trainingRankCatalogStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
		personnelTrainingsStore.load([], 'org-test-reset');
	});

	it('titles the empty list and the empty detail as level-3 headings, like a type header', () => {
		trainingTypesStore.load([], 'org-1');
		render(TrainingTypesPage, { props: { org, data: { personnel: [] } } });

		expect(screen.getByRole('heading', { name: 'No training types yet.', level: 3 })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Select a training type', level: 3 })).toBeTruthy();
	});

	it('keeps a failed type creation editable and shows a retryable error', async () => {
		vi.spyOn(trainingTypesStore, 'add').mockRejectedValueOnce(new Error('Synthetic save failure'));
		render(TrainingTypesPage, { props: { org, data: { personnel: [] } } });

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), {
			target: { value: 'Range Safety' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		expect(await screen.findByText('Failed to save training type.')).toBeTruthy();
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Range Safety');
		expect(screen.getByRole('button', { name: 'Create' }).hasAttribute('disabled')).toBe(false);
	});

	it('shows the server reason when a create or edit is rejected and keeps the draft open', async () => {
		const replies = [
			Response.json({ message: 'A Training type with that name already exists.' }, { status: 409 }),
			Response.json({ message: 'That Training type is no longer available.' }, { status: 404 })
		];
		const requests: Array<{ method?: string; body: unknown }> = [];
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			requests.push({ method: init.method, body: JSON.parse(init.body as string) });
			return replies.shift()!;
		});
		render(TrainingTypesPage, { props: { org, data: { personnel: [] } } });

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		const name = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
		expect(name.maxLength).toBe(100);
		await fireEvent.input(name, { target: { value: 'CPR' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create' }));
		expect(await screen.findByText('A Training type with that name already exists.')).toBeTruthy();
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('CPR');

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.click(screen.getByRole('row', { name: 'CPR' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CPR Renewal' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(await screen.findByText('That Training type is no longer available.')).toBeTruthy();
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('CPR Renewal');
		expect(requests.map(({ method, body }) => [method, (body as { name: string }).name])).toEqual([
			['POST', 'CPR'],
			['PUT', 'CPR Renewal']
		]);
	});

	it('keeps the fixed message for a server failure the user cannot correct', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ message: 'Internal server error' }, { status: 500 }));
		render(TrainingTypesPage, { props: { org, data: { personnel: [] } } });

		await fireEvent.click(screen.getByRole('row', { name: 'CPR' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CPR Renewal' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('Failed to save training type.')).toBeTruthy();
		expect(screen.queryByText('Internal server error')).toBeNull();
	});

	it('moves focus to the new type row after a create', async () => {
		vi.spyOn(trainingTypesStore, 'add').mockImplementationOnce(async (input) => {
			const created = { ...input, id: 'type-created' } as TrainingType;
			trainingTypesStore.load([trainingType, created], 'org-1');
			return created;
		});
		render(TrainingTypesPage, { props: { org, data: { personnel: [] } } });

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Range Safety' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('row', { name: 'Range Safety' })));
		expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
	});

	it.each(['+ New Type', 'Edit'])('moves focus into the Name field when %s opens the editor', async (name) => {
		render(TrainingTypesPage, { props: { org, data: { personnel: [] } } });
		const opener = screen.getByRole('button', { name });
		opener.focus();
		await fireEvent.click(opener);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })));
	});

	it('keeps focus on the other direction when a type reaches the end of the list', async () => {
		trainingTypesStore.load(
			[trainingType, { ...trainingType, id: 'type-2', name: 'First Aid', sortOrder: 1 }],
			'org-1'
		);
		vi.spyOn(trainingTypesStore, 'update').mockImplementation(async (id, patch) => {
			trainingTypesStore.load(
				trainingTypesStore.items.map((type) => (type.id === id ? { ...type, ...patch } : type)),
				'org-1'
			);
			return true;
		});
		render(TrainingTypesPage, { props: { org, data: { personnel: [] } } });

		const moveDown = screen.getByRole('button', { name: 'Move CPR down' });
		moveDown.focus();
		await fireEvent.click(moveDown);

		expect(screen.getByRole('button', { name: 'Move CPR down' }).hasAttribute('disabled')).toBe(true);
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move CPR up' })));
	});

	it('uses hydrated personnel when route bootstrap omits applicability source data', async () => {
		render(TrainingTypesPage, {
			props: {
				org,
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType])
						}
					},
					personnel: []
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Targeting/ }));

		expect(screen.getAllByRole('checkbox', { name: 'Medic' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: '68W' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: 'SGT' }).length).toBeGreaterThan(0);
	});

	it('uses active Organization rank catalog entries for applicability and preserves saved retired ranks', async () => {
		trainingTypesStore.load(
			[
				{
					...trainingType,
					appliesToRanks: ['DET-RET'],
					excludedRanks: ['LOCAL-MISSING']
				}
			],
			'org-1'
		);
		render(TrainingTypesPage, {
			props: {
				org,
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType]),
							rankCatalog: [
								rankCatalogEntry({ code: 'DET-RET', state: 'retired' }),
								rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' }),
								rankCatalogEntry({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force' })
							]
						}
					},
					personnel: []
				}
			}
		});

		await fireEvent.click(screen.getByRole('row', { name: 'CPR' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(screen.getAllByRole('checkbox', { name: 'PO2' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: 'SSgt' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: 'DET-RET' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: 'LOCAL-MISSING' }).length).toBeGreaterThan(0);
	});

	it('does not carry retired ranks from other training types into new type applicability', async () => {
		trainingTypesStore.load(
			[
				{
					...trainingType,
					appliesToRanks: ['DET-RET'],
					excludedRanks: ['LOCAL-MISSING']
				}
			],
			'org-1'
		);
		render(TrainingTypesPage, {
			props: {
				org,
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType]),
							rankCatalog: [
								rankCatalogEntry({ code: 'DET-RET', state: 'retired' }),
								rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' })
							]
						}
					},
					personnel: []
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Targeting/ }));

		expect(screen.getAllByRole('checkbox', { name: 'PO2' }).length).toBeGreaterThan(0);
		expect(screen.queryByRole('checkbox', { name: 'DET-RET' })).toBeNull();
		expect(screen.queryByRole('checkbox', { name: 'LOCAL-MISSING' })).toBeNull();
	});

	it('does not carry observed Personnel ranks retired by the catalog into new type applicability', async () => {
		personnelRosterHydration.load(
			[
				...personnel,
				{
					id: 'person-retired-rank',
					rank: 'DET-RET',
					lastName: 'Legacy',
					firstName: 'Taylor',
					mos: '11B',
					clinicRole: 'Rifleman',
					groupId: 'group-1',
					groupName: 'Alpha'
				}
			] as Personnel[],
			'org-1'
		);
		render(TrainingTypesPage, {
			props: {
				org,
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType]),
							rankCatalog: [
								rankCatalogEntry({ code: 'DET-RET', state: 'retired' }),
								rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' })
							]
						}
					},
					personnel: []
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Targeting/ }));

		expect(screen.getAllByRole('checkbox', { name: 'PO2' }).length).toBeGreaterThan(0);
		expect(screen.queryByRole('checkbox', { name: 'DET-RET' })).toBeNull();
	});

	it('keeps observed Personnel aliases that resolve to active catalog ranks selectable', async () => {
		personnelRosterHydration.load([{ ...personnel[0], rank: 'sgt' }] as Personnel[], 'org-1');

		render(TrainingTypesPage, {
			props: {
				org,
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType]),
							rankCatalog: [rankCatalogEntry({ code: 'SGT' })]
						}
					},
					personnel: []
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Targeting/ }));

		expect(screen.getAllByRole('checkbox', { name: 'SGT' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: 'sgt' }).length).toBeGreaterThan(0);
	});

	it('uses the hydrated Organization rank catalog when route rank catalog data is still streamed', async () => {
		const catalog = [
			rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' }),
			rankCatalogEntry({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force' })
		];
		trainingRankCatalogStore.load(catalog, 'org-1');

		render(TrainingTypesPage, {
			props: {
				org,
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType]),
							rankCatalog: Promise.resolve(catalog)
						}
					},
					personnel: []
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Targeting/ }));

		expect(screen.getAllByRole('checkbox', { name: 'PO2' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: 'SSgt' }).length).toBeGreaterThan(0);
	});

	it('puts New Type in the page toolbar and Edit in the detail toolbar', () => {
		render(TrainingTypesPage, { props: { org, data: { personnel } } });

		const page = screen.getByRole('toolbar', { name: 'Training type controls' });
		const detail = screen.getByRole('toolbar', { name: 'Training type detail controls' });
		expect(within(page).getByRole('button', { name: '+ New Type' })).toBeTruthy();
		expect(within(detail).getByRole('button', { name: 'Edit' })).toBeTruthy();
		expect(within(detail).queryByRole('button', { name: '+ New Type' })).toBeNull();
	});

	it('shows a viewer neither toolbar nor any command that changes a type', () => {
		render(TrainingTypesPage, { props: { org: viewer, data: { personnel } } });

		expect(screen.queryByRole('toolbar')).toBeNull();
		expect(screen.queryByRole('button', { name: '+ New Type' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
		expect(screen.getByRole('heading', { name: 'CPR', level: 3 })).toBeTruthy();
	});

	it('disables New Type with its reason while a type is being edited', async () => {
		render(TrainingTypesPage, { props: { org, data: { personnel } } });
		const toolbar = () => screen.getByRole('toolbar', { name: 'Training type controls' });
		expect((within(toolbar()).getByRole('button', { name: '+ New Type' }) as HTMLButtonElement).disabled).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		const newType = within(toolbar()).getByRole('button', { name: '+ New Type' }) as HTMLButtonElement;
		expect(newType.disabled).toBe(true);
		expect(toolbarDescription(newType)).toBe('Finish the current edit first');
		expect(screen.queryByRole('toolbar', { name: 'Training type detail controls' })).toBeNull();
	});

	it('keeps New Type and Edit on their rows when the toolbars have no room', async () => {
		const widths = stubToolbarWidths();
		try {
			render(TrainingTypesPage, { props: { org, data: { personnel } } });
			await widths.foldAll();

			expect(screen.getByRole('button', { name: '+ New Type' })).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
			expect(screen.queryByRole('button', { name: /^More/ })).toBeNull();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it.each([
		['deleted', []],
		['approval_required', ['completion-1']]
	] as const)(
		'keeps cached completions consistent when a type delete resolves %s',
		async (result, remainingCompletionIds) => {
			personnelTrainingsStore.load(
				[
					{ id: 'completion-1', personnelId: 'person-1', trainingTypeId: 'type-1' } as PersonnelTraining,
					{ id: 'completion-2', personnelId: 'person-1', trainingTypeId: 'type-2' } as PersonnelTraining
				],
				'org-1'
			);
			vi.spyOn(trainingTypesStore, 'remove').mockResolvedValueOnce(result);
			render(TrainingTypesPage, { props: { org, data: { personnel } } });

			await fireEvent.click(screen.getByRole('row', { name: 'CPR' }));
			await fireEvent.click(screen.getAllByRole('button', { name: /^Delete/ })[0]);
			await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

			await vi.waitFor(() =>
				expect(personnelTrainingsStore.items.map((completion) => completion.id).sort()).toEqual([
					...remainingCompletionIds,
					'completion-2'
				])
			);
		}
	);

	it('opens the create and edit forms from the page actions', async () => {
		render(TrainingTypesPage, {
			props: {
				org,
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType])
						}
					},
					personnel
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		expect(screen.getByText('New Training Type')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.click(screen.getByRole('row', { name: 'CPR' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(screen.getByText('Edit Training Type')).toBeTruthy();
		expect(screen.getByDisplayValue('CPR')).toBeTruthy();
	});
});

function rankCatalogEntry(overrides: Partial<RankCatalogEntry>): RankCatalogEntry {
	return {
		code: overrides.code ?? 'SGT',
		label: overrides.label ?? overrides.code ?? 'Sergeant',
		service: overrides.service ?? 'army',
		category: overrides.category ?? 'enlisted',
		payGrade: overrides.payGrade ?? 'E-5',
		state: overrides.state ?? 'active',
		sortOrder: overrides.sortOrder ?? 0
	};
}

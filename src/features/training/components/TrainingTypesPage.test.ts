// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingTypesPage from './TrainingTypesPage.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import type { RankCatalogEntry } from '$lib/domain/rankCatalog';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
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
	})
}));

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
		rosterStore.load(personnel, 'org-1');
		trainingRankCatalogStore.load([], 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');
	});

	afterEach(() => {
		cleanup();
		rosterStore.load([], 'org-test-reset');
		trainingRankCatalogStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
	});

	it('uses hydrated personnel when route bootstrap omits applicability source data', async () => {
		render(TrainingTypesPage, {
			props: {
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

		await fireEvent.click(screen.getByRole('button', { name: /^CPR 12mo/ }));
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

		expect(screen.getAllByRole('checkbox', { name: 'PO2' }).length).toBeGreaterThan(0);
		expect(screen.queryByRole('checkbox', { name: 'DET-RET' })).toBeNull();
		expect(screen.queryByRole('checkbox', { name: 'LOCAL-MISSING' })).toBeNull();
	});

	it('does not carry observed Personnel ranks retired by the catalog into new type applicability', async () => {
		rosterStore.load(
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

		expect(screen.getAllByRole('checkbox', { name: 'PO2' }).length).toBeGreaterThan(0);
		expect(screen.queryByRole('checkbox', { name: 'DET-RET' })).toBeNull();
	});

	it('keeps observed Personnel aliases that resolve to active catalog ranks selectable', async () => {
		rosterStore.load([{ ...personnel[0], rank: 'sgt' }] as Personnel[], 'org-1');

		render(TrainingTypesPage, {
			props: {
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

		expect(screen.getAllByRole('checkbox', { name: 'PO2' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: 'SSgt' }).length).toBeGreaterThan(0);
	});

	it('moves type management actions into the floating page toolbar', () => {
		render(TrainingTypesPage, {
			props: {
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

		const toolbar = screen.getByRole('toolbar', { name: 'Training type controls' });

		expect(toolbar).toBeTruthy();
		expect(screen.queryByTestId('page-toolbar')).toBeNull();
		expect(screen.getByRole('button', { name: '+ New Type' })).toBeTruthy();
		expect(screen.queryByText('1 configured')).toBeNull();
	});

	it('opens the create and edit forms from the page actions', async () => {
		render(TrainingTypesPage, {
			props: {
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
		await fireEvent.click(screen.getByRole('button', { name: /^CPR 12mo/ }));
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

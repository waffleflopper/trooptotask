// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openToolbarMore, openToolbarSubmenu, stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import type { RanksSettingsData, SettingsRankCatalogRow } from '../settingsSectionTypes';
import Page from './+page.svelte';

const toolbarName = 'Rank table controls';

function rank(
	code: string,
	label: string,
	service: SettingsRankCatalogRow['service'],
	serviceLabel: string,
	state: SettingsRankCatalogRow['state'],
	sortOrder: number
): SettingsRankCatalogRow {
	return {
		code,
		label,
		service,
		serviceLabel,
		category: 'enlisted',
		categoryLabel: 'Enlisted',
		payGrade: 'E-5',
		payGradeLabel: 'E-5',
		state,
		source: 'built-in',
		sourceLabel: 'Built-in',
		sortOrder,
		referenceSummary: {
			code,
			activeReferences: { personnel: 0, trainingApplicability: 0, total: 0 },
			historicalReferences: { signInRosterFilters: 0, signInRosterSnapshots: 0, total: 0 },
			canDelete: true
		} as SettingsRankCatalogRow['referenceSummary'],
		warnings: [],
		commands: { canEdit: false, canRetire: false, canReactivate: false, canDelete: false, deleteDisabledReason: null }
	};
}

const ranksSettings: RanksSettingsData = {
	sections: {
		ranks: {
			commands: { canManageCatalog: true, canAddServicePack: true, canAddCustomRank: true },
			copy: { payGradeHelp: 'Pay grade help', tieBreakHelp: 'Tie-break help' },
			servicePacks: [],
			options: {
				services: [
					{ value: 'army', label: 'Army' },
					{ value: 'navy', label: 'Navy' }
				],
				categories: [],
				payGrades: [],
				states: []
			},
			entries: {
				active: [
					rank('SGT', 'Sergeant', 'army', 'Army', 'active', 1),
					rank('PO1', 'Petty Officer First', 'navy', 'Navy', 'active', 2)
				],
				retired: [rank('SP4', 'Specialist Four', 'army', 'Army', 'retired', 3)]
			}
		}
	}
};

function renderPage() {
	render(Page, { props: { data: { ranksSettings } as never, form: null, params: { orgId: 'org-1' } } });
}

function table() {
	return within(screen.getByRole('table', { name: 'Organization ranks' }));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('rank table toolbar', () => {
	it('filters by state from the row and counts what the table shows', async () => {
		renderPage();

		expect(table().getByText('SGT')).toBeTruthy();
		expect(table().queryByText('SP4')).toBeNull();
		expect(screen.getByText('2 shown')).toBeTruthy();

		const state = within(screen.getByRole('group', { name: 'Filter ranks by state' }));
		expect(state.getByRole('button', { name: 'Active' }).getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(state.getByRole('button', { name: 'Retired' }));

		expect(state.getByRole('button', { name: 'Retired' }).getAttribute('aria-pressed')).toBe('true');
		expect(table().getByText('SP4')).toBeTruthy();
		expect(table().queryByText('SGT')).toBeNull();
		expect(screen.getByText('1 shown')).toBeTruthy();
	});

	it('searches the table by code or label from the toolbar search', async () => {
		renderPage();

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search ranks' }), { target: { value: 'petty' } });

		expect(table().getByText('PO1')).toBeTruthy();
		expect(table().queryByText('SGT')).toBeNull();
		expect(screen.getByText('1 shown')).toBeTruthy();
	});

	it('names the empty table after the state and branch the filters chose', async () => {
		renderPage();
		const state = within(screen.getByRole('group', { name: 'Filter ranks by state' }));

		await fireEvent.click(state.getByRole('button', { name: 'Retired' }));
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search ranks' }), { target: { value: 'zzz' } });

		expect(table().queryByText('SP4')).toBeNull();
		expect(screen.getByText('No retired ranks match all branches.')).toBeTruthy();
	});

	describe('when the toolbar folds', () => {
		async function renderFolded() {
			const widths = stubToolbarWidths();
			renderPage();
			await widths.foldAll();
		}

		it('moves the state switch and the branch filter into More', async () => {
			await renderFolded();
			const row = within(screen.getByRole('toolbar', { name: toolbarName }));
			expect(row.queryByRole('button', { name: 'Retired' })).toBeNull();
			expect(row.queryByRole('button', { name: 'Filter ranks by branch' })).toBeNull();

			const menu = await openToolbarMore(toolbarName);
			const state = within(within(menu).getByRole('group', { name: 'Filter ranks by state' }));
			expect(state.getByRole('menuitemradio', { name: 'Active' }).getAttribute('aria-checked')).toBe('true');
			await fireEvent.click(state.getByRole('menuitemradio', { name: 'Retired' }));

			expect(table().getByText('SP4')).toBeTruthy();
			expect(table().queryByText('SGT')).toBeNull();
		});

		it('filters by branch from the submenu and shows the choice on the More row', async () => {
			await renderFolded();

			await openToolbarMore(toolbarName);
			await openToolbarSubmenu('Branch, All branches');
			await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Navy' }));

			expect(table().getByText('PO1')).toBeTruthy();
			expect(table().queryByText('SGT')).toBeNull();
			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			await openToolbarMore(toolbarName);
			expect(screen.getByRole('menuitem', { name: 'Branch, Navy' })).toBeTruthy();
		});

		it('searches from the collapsed icon', async () => {
			await renderFolded();
			expect(screen.queryByRole('searchbox', { name: 'Search ranks' })).toBeNull();

			await fireEvent.click(screen.getByRole('button', { name: 'Search ranks' }));
			await fireEvent.input(await screen.findByRole('searchbox', { name: 'Search ranks' }), {
				target: { value: 'sergeant' }
			});

			expect(table().getByText('SGT')).toBeTruthy();
			expect(table().queryByText('PO1')).toBeNull();
		});
	});
});

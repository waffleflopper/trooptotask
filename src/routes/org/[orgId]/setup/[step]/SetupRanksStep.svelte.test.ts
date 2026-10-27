// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { enhanceRequests, frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import type { RanksSettingsData, SettingsRankCatalogRow } from '../../settings/settingsSectionTypes';
import SetupRanksStep from './SetupRanksStep.svelte';
import SetupStepHarness from './test-support/SetupStepHarness.svelte';
import { page } from './test-support/setupPage.svelte';
import { answerEndpoint, stepSource } from './test-support/setupSource';

vi.mock('$app/state', async () => await import('./test-support/setupPage.svelte'));
vi.mock('$app/forms', async () => {
	const { page } = await import('./test-support/setupPage.svelte');
	const { simulateEnhance } = await import('$lib/test-support/sveltekitEnhance');
	return {
		enhance: simulateEnhance,
		applyAction: async (result: { type: string; data?: unknown }) => {
			if (result.type === 'success' || result.type === 'failure') page.form = result.data ?? null;
		}
	};
});
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: { success: vi.fn() } }));

afterEach(() => {
	cleanup();
	enhanceRequests.length = 0;
	page.form = null;
	vi.unstubAllGlobals();
});

const sergeant: SettingsRankCatalogRow = {
	code: 'SGT',
	label: 'Sergeant',
	service: 'army',
	serviceLabel: 'Army',
	category: 'enlisted',
	categoryLabel: 'Enlisted',
	payGrade: 'E-5',
	payGradeLabel: 'E-5',
	state: 'active',
	source: 'built-in',
	sourceLabel: 'Built-in',
	sortOrder: 500,
	referenceSummary: {
		code: 'SGT',
		activeReferences: { personnel: 0, trainingApplicability: 0, total: 0 },
		historicalReferences: { signInRosterFilters: 0, signInRosterSnapshots: 0, total: 0 },
		canDelete: false
	},
	warnings: [],
	commands: { canEdit: false, canRetire: true, canReactivate: false, canDelete: false, deleteDisabledReason: null }
};

const ranksSettings: RanksSettingsData = {
	sections: {
		ranks: {
			commands: { canManageCatalog: true, canAddServicePack: true, canAddCustomRank: true },
			copy: { payGradeHelp: 'Pay grade help.', tieBreakHelp: 'Tie-break help.' },
			servicePacks: [],
			options: {
				services: [
					{ value: 'army', label: 'Army' },
					{ value: 'custom', label: 'Custom' }
				],
				categories: [{ value: 'custom', label: 'Custom' }],
				payGrades: [{ value: 'ungraded', label: 'Ungraded' }],
				states: [{ value: 'active', label: 'Active' }]
			},
			entries: { active: [sergeant], retired: [] }
		}
	}
};

const DUPLICATE = 'Rank catalog entry already exists. Edit it instead.';

async function renderRanksStep() {
	page.data = { ranksSettings: Promise.resolve(ranksSettings) };
	const fetch = vi.fn(answerEndpoint());
	vi.stubGlobal('fetch', fetch);
	const navigate = vi.fn(async () => {});
	render(SetupStepHarness, {
		props: {
			source: stepSource('ranks'),
			navigate,
			step: SetupRanksStep
		}
	});
	await fireEvent.click(await screen.findByRole('button', { name: 'Add custom rank' }));
	await fireEvent.input(screen.getByLabelText('Code'), { target: { value: 'SGT' } });
	await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Squad Sergeant' } });
	const add = screen.getByRole('button', { name: 'Add rank' }) as HTMLButtonElement;
	add.form!.requestSubmit(add);
	expect(enhanceRequests).toHaveLength(1);
	return { fetch, navigate };
}

// The editor posts to Settings › Ranks, so SvelteKit treats the setup page as one the action does not belong to.
const failOnSettingsRoute = () =>
	enhanceRequests[0](
		frameworkOutcome(
			{ type: 'failure', status: 409, data: { rankError: DUPLICATE } },
			{ away: true, applyForm: async () => {} }
		)
	);

it('shows a rejected rank on its field and keeps the draft', async () => {
	await renderRanksStep();

	await failOnSettingsRoute();

	const code = await screen.findByLabelText('Code');
	await waitFor(() => expect(code).toHaveAttribute('aria-invalid', 'true'));
	expect(code).toHaveAccessibleDescription(expect.stringContaining(DUPLICATE));
	expect(code).toHaveValue('SGT');
	expect(screen.getByLabelText('Label')).toHaveValue('Squad Sergeant');
});

it('holds Continue while a rank save is in flight, then stays on the step when it fails', async () => {
	const { fetch, navigate } = await renderRanksStep();
	const next = screen.getByRole('button', { name: /Continue to/ });

	await fireEvent.click(next);
	await new Promise((settle) => setTimeout(settle));

	expect(fetch).not.toHaveBeenCalled();
	expect(navigate).not.toHaveBeenCalled();

	await failOnSettingsRoute();

	await waitFor(() => expect(next).toBeEnabled());
	expect(navigate).not.toHaveBeenCalled();
	expect(screen.getByLabelText('Code')).toHaveValue('SGT');
	await fireEvent.click(next);
	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/personnel'));
});

it('keeps the editor and offers Retry when a refresh after a change fails', async () => {
	page.data = { ranksSettings: Promise.resolve(ranksSettings) };
	vi.stubGlobal('fetch', vi.fn(answerEndpoint()));
	render(SetupStepHarness, {
		props: { source: stepSource('ranks'), navigate: vi.fn(async () => {}), step: SetupRanksStep }
	});
	await screen.findByRole('button', { name: 'Add custom rank' });
	expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();

	const refresh = Promise.reject(new Error('upstream'));
	refresh.catch(() => {});
	page.data = { ranksSettings: refresh };

	await screen.findByRole('button', { name: 'Retry' });
	expect(screen.getByRole('button', { name: 'Add custom rank' })).toBeInTheDocument();
});

// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { groupCatalogHydration, type PersonnelPageContext } from '$features/personnel';
import SetupGroupsStep from './SetupGroupsStep.svelte';
import SetupStepHarness from './test-support/SetupStepHarness.svelte';
import { page } from './test-support/setupPage.svelte';
import { personnelStubs } from './test-support/personnelStubs';
import { answerEndpoint, stepSource } from './test-support/setupSource';

vi.mock('$app/state', async () => await import('./test-support/setupPage.svelte'));
vi.mock('./SetupPersonnelWorkspace.svelte', async () => ({
	default: (await import('./test-support/PersonnelWorkspaceStub.svelte')).default
}));

afterEach(() => {
	cleanup();
	groupCatalogHydration.load([], 'alpha');
	personnelStubs.ctx = null;
	vi.unstubAllGlobals();
});

function renderGroupsStep({ canManageGroups = true, people = [] as { groupId: string | null }[] } = {}) {
	const openGroupEditor = vi.fn();
	personnelStubs.ctx = {
		canManageGroups,
		allActivePersonnel: people,
		peek: { changed: vi.fn() },
		openGroupEditor
	} as unknown as PersonnelPageContext;
	page.data = { orgId: 'alpha' };
	const fetch = vi.fn(answerEndpoint());
	vi.stubGlobal('fetch', fetch);
	const navigate = vi.fn(async () => {});
	render(SetupStepHarness, { props: { source: stepSource('groups'), navigate, step: SetupGroupsStep } });
	return { fetch, navigate, openGroupEditor };
}

it('opens the Group manager from the empty step, with no Manage groups button beside it', async () => {
	const { openGroupEditor } = renderGroupsStep();

	expect(screen.queryByRole('button', { name: 'Manage groups' })).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Add your Groups' }));

	expect(openGroupEditor).toHaveBeenCalledWith(null);
});

it('skips to Ranks with one roster the way Continue does', async () => {
	const { fetch, navigate } = renderGroupsStep();

	await fireEvent.click(screen.getByRole('button', { name: 'Skip, keep one roster' }));

	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/ranks'));
	expect(fetch).toHaveBeenCalledWith(
		'/org/alpha/api/organization/setup/answer',
		expect.objectContaining({ body: JSON.stringify({ step: 'groups', answer: 'reviewed' }) })
	);
});

const catalog = [
	{ id: 'plt', name: '2nd Platoon', sortOrder: 0, parentId: null, depth: 1 as const },
	{ id: 'sq', name: '1st Squad', sortOrder: 0, parentId: 'plt', depth: 2 as const },
	{ id: 'alpha-team', name: 'Alpha Team', sortOrder: 0, parentId: 'sq', depth: 3 as const },
	{ id: 'hq', name: 'HQ', sortOrder: 1, parentId: null, depth: 1 as const }
];
const roster = ['plt', 'alpha-team', 'alpha-team', 'hq'].map((groupId) => ({ groupId }));

it('edits the Group tree in place for a manager, with the full manager one click away', async () => {
	groupCatalogHydration.load(catalog, 'alpha');
	const { openGroupEditor } = renderGroupsStep({ people: roster });

	expect(screen.getByRole('list', { name: 'Groups in display order' })).toBeTruthy();
	expect(screen.getByRole('list', { name: 'Sub-groups of 1st Squad' })).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Add a sub-group to 1st Squad' })).toBeTruthy();
	await fireEvent.click(screen.getByRole('button', { name: 'Manage groups' }));

	expect(openGroupEditor).toHaveBeenCalledWith('plt');
});

it('shows a reader the nested Groups with everyone under each one', () => {
	groupCatalogHydration.load(catalog, 'alpha');
	renderGroupsStep({ canManageGroups: false, people: roster });

	expect(screen.getAllByRole('listitem').map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
		'2nd Platoon 3 people',
		'1st Squad 2 people',
		'Alpha Team 2 people',
		'HQ 1 person'
	]);
	expect(screen.queryByRole('textbox', { name: 'New group name' })).toBeNull();
});

// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { PersonnelPageContext } from '$features/personnel';
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
	personnelStubs.ctx = null;
	vi.unstubAllGlobals();
});

function renderGroupsStep() {
	const openGroupEditor = vi.fn();
	personnelStubs.ctx = {
		canManageGroups: true,
		allActivePersonnel: [],
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

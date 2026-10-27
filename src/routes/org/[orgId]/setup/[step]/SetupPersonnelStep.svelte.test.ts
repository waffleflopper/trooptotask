// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { BUILT_IN_RANK_CATALOG, type Personnel } from '$features/personnel/contracts';
import type { PersonnelPageContext } from '$features/personnel';
import { ImportSession } from '$lib/components/patterns/import-flow';
import SetupPersonnelStep from './SetupPersonnelStep.svelte';
import SetupStepHarness from './test-support/SetupStepHarness.svelte';
import { page } from './test-support/setupPage.svelte';
import { personnelStubs } from './test-support/personnelStubs';
import { answerEndpoint, stepSource } from './test-support/setupSource';

vi.mock('$app/state', async () => await import('./test-support/setupPage.svelte'));
vi.mock('./SetupPersonnelWorkspace.svelte', async () => ({
	default: (await import('./test-support/PersonnelWorkspaceStub.svelte')).default
}));
vi.mock('$lib/components/patterns/import-flow', async (original) => ({
	...(await original<typeof import('$lib/components/patterns/import-flow')>()),
	ImportFlow: (await import('./test-support/ImportFlowStub.svelte')).default
}));

afterEach(() => {
	cleanup();
	personnelStubs.ctx = null;
	personnelStubs.lane = null;
	vi.unstubAllGlobals();
});

const added: Personnel = {
	id: 'p-doe',
	rank: 'SGT',
	lastName: 'Doe',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: '',
	ets: null,
	deros: null,
	groupId: null,
	groupName: ''
};

function renderPersonnelStep(setupFacts?: Promise<never>) {
	page.data = { orgId: 'alpha' };
	const fetch = vi.fn(answerEndpoint());
	vi.stubGlobal('fetch', fetch);
	const navigate = vi.fn(async () => {});
	render(SetupStepHarness, {
		props: { source: stepSource('personnel', setupFacts), navigate, step: SetupPersonnelStep }
	});
	return { fetch, navigate };
}

it('matches a person added on the step when the roster is imported', async () => {
	// The load-time roster was empty; the person added on the step is only on the live roster.
	personnelStubs.ctx = {
		orgId: 'alpha',
		orgUrlSegment: 'alpha',
		data: { personnel: [], rankCatalog: BUILT_IN_RANK_CATALOG },
		allActivePersonnel: [added],
		canAddPersonnel: false,
		canImportPersonnel: true,
		canManageGroups: false,
		allowUnassignedPersonnel: true
	} as unknown as PersonnelPageContext;
	renderPersonnelStep();
	await waitFor(() => expect(personnelStubs.lane).not.toBeNull());

	const session = new ImportSession(() => personnelStubs.lane as never);
	const csv = ['Last name,First name,Rank,MOS', 'Doe,Jane,SGT,25B'].join('\n');
	await session.chooseFile([new File([csv], 'roster.csv')]);
	session.goTo('review');

	expect(session.review.rows).toMatchObject([
		{ outcome: 'update', change: { personnelId: 'p-doe', changes: { mos: '25B' } } }
	]);
});

it('records Later when the owner continues before the roster count loads', async () => {
	const { fetch, navigate } = renderPersonnelStep(new Promise<never>(() => {}));

	await fireEvent.click(screen.getByRole('button', { name: /Continue to/ }));

	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/calendar'));
	expect(fetch).toHaveBeenCalledWith(
		'/org/alpha/api/organization/setup/answer',
		expect.objectContaining({ body: JSON.stringify({ step: 'personnel', answer: 'later' }) })
	);
});

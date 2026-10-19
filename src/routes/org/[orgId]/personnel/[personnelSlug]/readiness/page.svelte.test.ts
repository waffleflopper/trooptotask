// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { PersonnelTrainingReadiness } from '$features/training/contracts';
import { createClientAccess } from '$lib/access/clientAccess';
import Page from './+page.svelte';

vi.mock('$features/app-shell', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/app-shell')>()),
	getAppShellContext: () => Object.assign(createClientAccess({ membershipRole: 'owner' }), { orgId: 'org-1' })
}));
vi.mock('$app/state', () => ({ page: { state: {} } }));
vi.mock('$app/navigation', () => ({
	afterNavigate: vi.fn(),
	goto: vi.fn(),
	invalidate: vi.fn(),
	replaceState: vi.fn()
}));

afterEach(cleanup);

const training: PersonnelTrainingReadiness = {
	personnelId: 'person-1',
	mos: '68W',
	items: [],
	notRequiredCount: 0,
	exemptCount: 0
};

function data(personId: string, trainingRead: Promise<PersonnelTrainingReadiness>) {
	return {
		personnelDetailHeader: { person: { id: personId, rank: 'SGT', lastName: personId, groupId: null } },
		asOf: '2026-10-06',
		readiness: {
			training: trainingRead,
			criticalTasks: new Promise(() => {}),
			evaluation: new Promise(() => {}),
			loss: new Promise(() => {}),
			onboarding: new Promise(() => {})
		}
	} as unknown as ComponentProps<typeof Page>['data'];
}

it("drops the previous Person's rows while the next Person's reads are pending", async () => {
	const view = render(Page, { props: { data: data('person-1', Promise.resolve(training)) } });
	await screen.findByText('0 of 0 ready');

	await view.rerender({ data: data('person-2', new Promise(() => {})) });

	expect(screen.queryByText('0 of 0 ready')).toBeNull();
	expect(screen.getByLabelText('Training', { selector: '[aria-busy="true"]' })).toBeTruthy();
});

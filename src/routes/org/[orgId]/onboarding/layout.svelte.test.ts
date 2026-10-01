// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { afterEach, expect, it, vi } from 'vitest';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { onboardingWorkspaceHydrator } from '$features/onboarding/onboardingWorkspaceHydration.svelte';
import type { OnboardingWorkspaceResult } from '$features/onboarding/contracts';
import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';

const organization = new SvelteMap([['id', 'org-a']]);
vi.mock('$lib/stores/orgContext.svelte', async (original) => ({
	...(await original<typeof import('$lib/stores/orgContext.svelte')>()),
	getOrgContext: () => ({
		get orgId() {
			return organization.get('id');
		}
	})
}));
import Layout from './+layout.svelte';

const packet: PersonnelOnboarding = {
	id: 'packet-a',
	personnelId: 'person-a',
	templateId: null,
	status: 'in_progress',
	startedAt: '2026-03-15',
	completedAt: null,
	cancelledAt: null,
	steps: []
};
const workspace = {
	hydration: {
		orgId: 'org-a',
		personnel: { mode: 'preserve-client' },
		groups: { mode: 'preserve-client' },
		trainingTypes: { mode: 'preserve-client' },
		onboardingTemplates: { mode: 'preserve-client' },
		onboardings: { mode: 'replace', snapshotKey: 'cached-a', items: [packet] }
	}
} as OnboardingWorkspaceResult;
const children = createRawSnippet(() => ({ render: () => '<p>Onboarding workspace</p>' }));

afterEach(() => {
	cleanup();
	onboardingWorkspaceHydrator.reset();
	onboardingStore.load([], 'reset');
	organization.set('id', 'org-a');
	vi.unstubAllGlobals();
});

it('restores a reused A workspace after visiting B while its workspace is still pending', async () => {
	const view = render(Layout, { props: { children, data: { onboarding: { data: workspace } } } });
	await waitFor(() => expect(onboardingStore.items).toEqual([packet]));
	let resolveB!: (workspace: OnboardingWorkspaceResult) => void;
	const pendingB = new Promise<OnboardingWorkspaceResult>((resolve) => {
		resolveB = resolve;
	});
	organization.set('id', 'org-b');
	await view.rerender({ children, data: { onboarding: { data: pendingB } } });
	await waitFor(() => expect(onboardingStore.orgId).toBe('org-b'));
	expect(onboardingStore.items).toEqual([]);
	organization.set('id', 'org-a');
	await view.rerender({ children, data: { onboarding: { data: workspace } } });
	await waitFor(() => expect(onboardingStore.items).toEqual([packet]));
	resolveB({
		...workspace,
		hydration: { ...workspace.hydration, orgId: 'org-b', onboardings: { mode: 'replace', snapshotKey: 'b', items: [] } }
	});
	await pendingB;
	expect(onboardingStore.items).toEqual([packet]);
});

it('ignores a request from a destroyed layout when returning to the same organization', async () => {
	const view = render(Layout, { props: { children, data: { onboarding: { data: workspace } } } });
	await waitFor(() => expect(onboardingStore.items).toEqual([packet]));
	let respond!: (response: Response) => void;
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					respond = resolve;
				})
		)
	);
	const pending = onboardingStore.startOnboarding('person-new', '2026-03-15', null);
	view.unmount();
	render(Layout, { props: { children, data: { onboarding: { data: workspace } } } });
	await waitFor(() => expect(onboardingStore.items).toEqual([packet]));
	respond(Response.json({ ...packet, id: 'new-packet', personnelId: 'person-new' }));
	await expect(pending).resolves.toBeNull();
	expect(onboardingStore.items).toEqual([packet]);
});

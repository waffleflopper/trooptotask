// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { onboardingStore, onboardingWorkspaceHydrator } from '$features/onboarding';
import type { OnboardingWorkspaceResult, PersonnelOnboarding } from '$features/onboarding/contracts';
import Layout from './+layout.svelte';

const shell = (id = 'org-a') => ({ org: { id } });

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
	vi.unstubAllGlobals();
});

it('restores a reused A workspace after visiting B while its workspace is still pending', async () => {
	const view = render(Layout, { props: { children, data: { shell: shell(), onboarding: { data: workspace } } } });
	await waitFor(() => expect(onboardingStore.items).toEqual([packet]));
	let resolveB!: (workspace: OnboardingWorkspaceResult) => void;
	const pendingB = new Promise<OnboardingWorkspaceResult>((resolve) => {
		resolveB = resolve;
	});
	await view.rerender({ children, data: { shell: shell('org-b'), onboarding: { data: pendingB } } });
	await waitFor(() => expect(onboardingStore.orgId).toBe('org-b'));
	expect(onboardingStore.items).toEqual([]);
	await view.rerender({ children, data: { shell: shell(), onboarding: { data: workspace } } });
	await waitFor(() => expect(onboardingStore.items).toEqual([packet]));
	resolveB({
		...workspace,
		hydration: { ...workspace.hydration, orgId: 'org-b', onboardings: { mode: 'replace', snapshotKey: 'b', items: [] } }
	});
	await pendingB;
	expect(onboardingStore.items).toEqual([packet]);
});

it('ignores a request from a destroyed layout when returning to the same organization', async () => {
	const view = render(Layout, { props: { children, data: { shell: shell(), onboarding: { data: workspace } } } });
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
	const pending = onboardingStore.startOnboarding('person-new', '2026-03-15', 'template-1');
	view.unmount();
	render(Layout, { props: { children, data: { shell: shell(), onboarding: { data: workspace } } } });
	await waitFor(() => expect(onboardingStore.items).toEqual([packet]));
	respond(Response.json({ ...packet, id: 'new-packet', personnelId: 'person-new', templateId: 'template-1' }));
	await expect(pending).resolves.toBeNull();
	expect(onboardingStore.items).toEqual([packet]);
});

it('replaces the workspace with a load error and a working retry when the streamed Onboarding lane rejects', async () => {
	const reload = vi.fn();
	vi.stubGlobal('location', { ...window.location, reload });
	const rejected = Promise.reject(new Error('onboardings failed'));
	rejected.catch(() => {});

	render(Layout, { props: { children, data: { shell: shell(), onboarding: { data: rejected } } } });

	expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Onboarding');
	expect(screen.queryByText('Onboarding workspace')).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Retry Onboarding' }));
	expect(reload).toHaveBeenCalledTimes(1);
});

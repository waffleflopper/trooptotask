// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

const { restrict, hydrate } = vi.hoisted(() => ({ restrict: vi.fn(), hydrate: vi.fn() }));
vi.mock('$features/rating-scheme', () => ({
	ratingSchemeWorkspaceHydrator: { restrict, hydrate }
}));
import Layout from './+layout.svelte';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const allowed = {
	laneKey: 'ratingScheme',
	data: { personnelLookup: [], ratingSchemeEntries: [], lossWarningWindowDays: 180 },
	hydration: { orgId: 'org-1', ratingSchemeEntries: { mode: 'replace', snapshotKey: 'allowed', items: [] } }
} as const;
const restricted = { laneKey: 'ratingScheme', access: 'restricted' } as const;
type Workspace = typeof allowed | typeof restricted;
const children = createRawSnippet(() => ({
	render: () => '<section data-testid="evals-child">Evaluation workspace</section>'
}));
function data(workspace: Workspace | Promise<Workspace>) {
	return { shell: { org: { id: 'org-1' } }, ratingScheme: { data: workspace } };
}

it('replaces the previous child with a denial and restores the allowed workspace after access returns', async () => {
	const view = render(Layout, { props: { children, data: data(allowed) } });
	await waitFor(() => expect(hydrate).toHaveBeenCalledWith(allowed.hydration));
	let resolve!: (workspace: Workspace) => void;
	const pending = new Promise<Workspace>((done) => {
		resolve = done;
	});
	await view.rerender({ children, data: data(pending) });
	resolve(restricted);
	await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
	expect(screen.queryByTestId('evals-child')).toBeNull();
	expect(restrict).toHaveBeenCalledWith('org-1');
	await view.rerender({ children, data: data(allowed) });
	await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
	expect(screen.getByTestId('evals-child')).toBeTruthy();
});

it('ignores an older allowed response after an immediate restriction replaces it', async () => {
	let resolve!: (workspace: Workspace) => void;
	const pending = new Promise<Workspace>((done) => {
		resolve = done;
	});
	const view = render(Layout, { props: { children, data: data(pending) } });
	await view.rerender({ children, data: data(restricted) });
	await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
	resolve(allowed);
	await pending;
	expect(hydrate).not.toHaveBeenCalled();
	expect(screen.queryByTestId('evals-child')).toBeNull();
});

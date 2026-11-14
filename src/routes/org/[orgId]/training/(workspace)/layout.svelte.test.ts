// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';

const { hydrateMock, restrictMock } = vi.hoisted(() => ({ hydrateMock: vi.fn(), restrictMock: vi.fn() }));
vi.mock('$features/training', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/training')>()),
	trainingWorkspaceHydrator: { hydrate: hydrateMock, restrict: restrictMock, reset: vi.fn() }
}));

import Layout from './+layout.svelte';

vi.mock('$app/state', () => ({
	page: { data: { shell: { org: { id: 'org-1', name: 'Alpha Company', urlSegment: 'alpha' } } } }
}));

afterEach(() => {
	cleanup();
	hydrateMock.mockClear();
	restrictMock.mockClear();
});

it('shows a streamed Training denial without hydrating or rendering the workspace', async () => {
	const children = createRawSnippet(() => ({ render: () => '<section>Training child</section>' }));
	render(Layout, {
		props: {
			children,
			data: {
				shell: { org: { id: 'org-1' } },
				training: { data: Promise.resolve({ laneKey: 'training', access: 'restricted' } as const) }
			}
		}
	});

	await waitFor(() => expect(screen.getByRole('heading', { name: 'Access Restricted' })).toBeTruthy());
	expect(screen.getByRole('alert').textContent).toContain('Training View');
	expect(screen.queryByText('Training child')).toBeNull();
	expect(hydrateMock).not.toHaveBeenCalled();
});

it('replaces the workspace with a load error and a working retry when the streamed Training lane rejects', async () => {
	const reload = vi.fn();
	vi.stubGlobal('location', { ...window.location, reload });
	const children = createRawSnippet(() => ({ render: () => '<section>Training child</section>' }));
	const rejected = Promise.reject(new Error('personnel_trainings failed'));
	rejected.catch(() => {});

	render(Layout, {
		props: { children, data: { shell: { org: { id: 'org-1' } }, training: { data: rejected } } }
	});

	const alert = await screen.findByRole('alert');
	expect(alert.textContent).toContain('Unable to load Training');
	expect(screen.queryByText('Training child')).toBeNull();

	await fireEvent.click(screen.getByRole('button', { name: 'Retry Training' }));
	expect(reload).toHaveBeenCalledTimes(1);
	vi.unstubAllGlobals();
});

it('keeps the workspace on screen and reports the failure when a refresh rejects', async () => {
	const children = createRawSnippet(() => ({ render: () => '<input aria-label="Unsaved notes" />' }));
	const shell = { org: { id: 'org-1' } };
	const view = render(Layout, {
		props: { children, data: { shell, training: { data: Promise.resolve({ laneKey: 'training', hydration: {} }) } } }
	});
	await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
	await fireEvent.input(screen.getByLabelText('Unsaved notes'), { target: { value: 'Keep this draft' } });
	const rejected = Promise.reject(new Error('personnel_trainings failed'));
	rejected.catch(() => {});

	await view.rerender({ children, data: { shell, training: { data: rejected } } });

	expect((await screen.findByRole('alert')).textContent).toContain('could not be refreshed');
	expect((screen.getByLabelText('Unsaved notes') as HTMLInputElement).value).toBe('Keep this draft');
});

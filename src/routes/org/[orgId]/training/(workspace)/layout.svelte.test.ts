// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';

const { hydrateMock, restrictMock } = vi.hoisted(() => ({ hydrateMock: vi.fn(), restrictMock: vi.fn() }));
vi.mock('$features/training', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/training')>()),
	trainingWorkspaceHydrator: { hydrate: hydrateMock, restrict: restrictMock }
}));

import Layout from './+layout.svelte';

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
	expect(screen.getByText(/permission to view training/)).toBeTruthy();
	expect(screen.queryByText('Training child')).toBeNull();
	expect(hydrateMock).not.toHaveBeenCalled();
	expect(restrictMock).toHaveBeenCalledWith('org-1');
});

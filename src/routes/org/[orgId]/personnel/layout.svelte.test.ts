// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';

const { hydrateMock, restrictMock } = vi.hoisted(() => ({ hydrateMock: vi.fn(), restrictMock: vi.fn() }));
vi.mock('$features/personnel', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/personnel')>()),
	personnelWorkspaceHydrator: { hydrate: hydrateMock, restrict: restrictMock }
}));

import Layout from './+layout.svelte';

afterEach(() => {
	cleanup();
	hydrateMock.mockClear();
	restrictMock.mockClear();
});

it('shows a streamed Personnel denial without hydrating or rendering the roster', async () => {
	const children = createRawSnippet(() => ({ render: () => '<section>Personnel child</section>' }));
	render(Layout, {
		props: {
			children,
			data: {
				shell: { org: { id: 'org-1' } },
				personnel: { data: Promise.resolve({ laneKey: 'personnel', access: 'restricted' } as const) }
			}
		}
	});

	await waitFor(() => expect(screen.getByRole('heading', { name: 'Access Restricted' })).toBeTruthy());
	expect(screen.getByText(/permission to view personnel/)).toBeTruthy();
	expect(screen.queryByText('Personnel child')).toBeNull();
	expect(hydrateMock).not.toHaveBeenCalled();
	expect(restrictMock).toHaveBeenCalledWith('org-1', expect.any(Object));
});

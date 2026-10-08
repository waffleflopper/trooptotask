// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

const { restrictMock } = vi.hoisted(() => ({ restrictMock: vi.fn() }));

vi.mock('$features/calendar/calendarWorkspaceHydration.svelte', () => ({
	calendarWorkspaceHydrator: {
		hydrate: vi.fn(),
		restrict: restrictMock,
		reset: vi.fn()
	}
}));

import Layout from './+layout.svelte';

afterEach(() => {
	cleanup();
	restrictMock.mockClear();
});

it('settles a revoked Calendar grant and removes the previous child workspace', async () => {
	let resolveWorkspace!: (workspace: { laneKey: 'calendar'; access: 'restricted' }) => void;
	const workspace = new Promise<{ laneKey: 'calendar'; access: 'restricted' }>((resolve) => {
		resolveWorkspace = resolve;
	});
	const children = createRawSnippet(() => ({
		render: () => '<section data-testid="calendar-child">Previous Calendar workspace</section>'
	}));

	render(Layout, {
		props: {
			children,
			data: {
				shell: { org: { id: 'org-1' } },
				calendar: { data: workspace }
			}
		}
	});

	expect(screen.queryByTestId('calendar-child')).toBeNull();
	expect(screen.getByRole('status')).toBeTruthy();
	resolveWorkspace({ laneKey: 'calendar', access: 'restricted' });

	await waitFor(() => expect(screen.getByRole('heading', { name: 'Access Restricted' })).toBeTruthy());
	expect(screen.queryByTestId('calendar-child')).toBeNull();
	expect(screen.queryByRole('status')).toBeNull();
});

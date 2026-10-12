// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
	vi.unstubAllGlobals();
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
	const loading = screen.getByRole('status');
	expect(loading.textContent).toContain('Loading Calendar data');
	expect(loading.hasAttribute('aria-busy')).toBe(false);
	resolveWorkspace({ laneKey: 'calendar', access: 'restricted' });

	await waitFor(() => expect(screen.getByRole('heading', { name: 'Access Restricted' })).toBeTruthy());
	expect(screen.queryByTestId('calendar-child')).toBeNull();
	expect(screen.queryByRole('status')).toBeNull();
});

it('replaces the Calendar workspace with a load error and a working retry when the streamed workspace rejects', async () => {
	const reload = vi.fn();
	vi.stubGlobal('location', { ...window.location, reload });
	const rejected = Promise.reject(new Error('availability failed'));
	rejected.catch(() => {});
	const children = createRawSnippet(() => ({
		render: () => '<section data-testid="calendar-child">Calendar workspace</section>'
	}));

	render(Layout, {
		props: { children, data: { shell: { org: { id: 'org-1' } }, calendar: { data: rejected } } }
	});

	expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Calendar');
	expect(screen.queryByTestId('calendar-child')).toBeNull();
	expect(screen.queryByRole('status')).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Retry Calendar' }));
	expect(reload).toHaveBeenCalledTimes(1);
});

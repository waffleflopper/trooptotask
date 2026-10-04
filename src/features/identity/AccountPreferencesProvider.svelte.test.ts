// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Provider from './AccountPreferencesProvider.svelte';
import { getAccountPreferencesContext } from './accountPreferencesContext';
import { getDefaultUserOrgPreferences } from './accountPreferences';
import type { AccountPreferencesState } from './accountPreferences.svelte';

const { showError } = vi.hoisted(() => ({ showError: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { error: showError } }));

function props(userId = 'user-a', orgId = 'org-a', capture: (state: AccountPreferencesState) => void) {
	return {
		userId,
		orgId,
		preferences: getDefaultUserOrgPreferences(),
		children: createRawSnippet(() => {
			capture(getAccountPreferencesContext());
			return { render: () => '<p>Workspace</p>' };
		})
	};
}

describe('layout-owned account preferences', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('keeps local intent over revalidated seeds and cancels unsent work on destruction', async () => {
		const fetcher = vi.fn();
		vi.stubGlobal('fetch', fetcher);
		let state!: AccountPreferencesState;
		const initial = props('user-a', 'org-a', (value) => {
			state = value;
		});
		const view = render(Provider, initial);
		state.patch({ training: { matrixViewMode: 'alphabetical' } });
		await view.rerender({ preferences: getDefaultUserOrgPreferences() });
		expect(state.value.training.matrixViewMode).toBe('alphabetical');
		view.unmount();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('isolates simultaneous trees and suppresses a destroyed tree’s delayed feedback', async () => {
		let rejectOld!: (error: Error) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((_resolve, reject) => {
						rejectOld = reject;
					})
			)
		);
		let first!: AccountPreferencesState;
		let second!: AccountPreferencesState;
		const oldTree = render(
			Provider,
			props('user-a', 'org-a', (value) => {
				first = value;
			})
		);
		render(
			Provider,
			props('user-b', 'org-b', (value) => {
				second = value;
			})
		);
		first.patch({ calendar: { showPersonnelRoles: true } });
		await vi.advanceTimersByTimeAsync(350);
		expect(second.value.calendar.showPersonnelRoles).toBe(false);
		oldTree.unmount();
		let replacement!: AccountPreferencesState;
		render(
			Provider,
			props('user-a', 'org-a', (value) => {
				replacement = value;
			})
		);
		rejectOld(new Error('Old save failed'));
		await vi.advanceTimersByTimeAsync(0);
		expect(replacement.value.calendar.showPersonnelRoles).toBe(false);
		expect(second.value.calendar.showPersonnelRoles).toBe(false);
		expect(showError).not.toHaveBeenCalled();
	});
});

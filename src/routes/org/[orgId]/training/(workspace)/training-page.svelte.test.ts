// @vitest-environment happy-dom
import { createRawSnippet, getAllContexts, mount, unmount, untrack } from 'svelte';
import AccountPreferencesProvider from '$features/identity/AccountPreferencesProvider.svelte';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { trainingTypesStore } from '$features/training';
import { trainingViewsStore } from '$features/training';
import { personnelTrainingsStore } from '$features/training';
import { groupCatalogHydration } from '$features/personnel';
import { pinnedGroupsHydration } from '$features/personnel';
import { personnelRosterHydration } from '$features/personnel';
import { createReadyAppShellRouteData } from '../../appShell.test-support';

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			onboarding: 'configure',
			members: 'configure',
			criticalTasks: 'configure',
			ratingScheme: 'configure',
			reports: 'configure'
		},
		hasCapability: vi.fn(() => true),
		scopeSet: { kind: 'organization' },
		affordanceForFeatureAction: () => ({
			allowed: true,
			visible: true,
			disabled: false,
			reason: 'allowed:capability',
			explanation: '',
			decision: {}
		})
	})
}));

const WithPreferences: typeof Page = (anchor, props) => {
	const shell = untrack(() => props.data.shell);
	if (shell.kind !== 'ready') throw new Error('Test requires admitted shell');
	const children = createRawSnippet(() => {
		const context = getAllContexts();
		return {
			render: () => '<section></section>',
			setup: (target) => {
				const page = mount(Page, { target, props, context });
				return () => {
					void unmount(page);
				};
			}
		};
	});
	AccountPreferencesProvider(anchor, {
		userId: shell.user.id,
		orgId: shell.org.id,
		preferences: shell.preferences,
		children
	});
	return {};
};

function makePageData() {
	return {
		...createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Test Unit' }),
		training: {
			data: new Promise(() => undefined)
		}
	};
}

describe('training page', () => {
	beforeEach(() => {
		personnelRosterHydration.startLoading();
		groupCatalogHydration.startLoading();
		trainingTypesStore.startLoading();
		trainingViewsStore.startLoading();
		personnelTrainingsStore.startLoading();
		pinnedGroupsHydration.load([], 'org-1');
	});

	afterEach(() => {
		cleanup();
		personnelRosterHydration.load([], 'org-test-reset');
		groupCatalogHydration.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
		personnelTrainingsStore.load([], 'org-test-reset');
		pinnedGroupsHydration.load([], 'org-test-reset');
	});
	it('keeps the immediate matrix choice when older shell props are revalidated', async () => {
		const view = render(WithPreferences, { props: { data: makePageData() } });
		await fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
		expect(screen.getByRole('button', { name: 'A–Z' }).getAttribute('aria-pressed')).toBe('true');
		await view.rerender({ data: makePageData() });
		expect(screen.getByRole('button', { name: 'A–Z' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', { name: /^Groups$/ }).getAttribute('aria-pressed')).toBe('false');
	});
});

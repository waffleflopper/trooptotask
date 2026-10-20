// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn() }));
vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		orgId: 'org-1',
		orgUrlSegment: 'unit',
		orgName: 'Unit',
		scopeSet: { kind: 'organization' },
		affordanceForFeatureAction: () => ({ allowed: true, visible: true, disabled: false, reason: 'allowed:capability' })
	})
}));

import Layout from './+layout.svelte';
import ImportPage from './import/+page.svelte';
import DetailPage from './[personnelSlug]/+page.svelte';
import RouteHarness from '$features/personnel/test-support/PersonnelRouteTestHarness.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const person: Personnel = {
	id: 'person-1',
	slug: 'rivera-monica',
	rank: 'SGT',
	lastName: 'Rivera',
	firstName: 'Monica',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'group-1',
	groupName: 'Alpha',
	archivedAt: null,
	ets: null,
	deros: null
};

const pending = <T>() => new Promise<T>(() => {});

function rejectedRouteData() {
	const rejected = Promise.reject(new Error('personnel failed'));
	rejected.catch(() => {});
	return {
		shell: { org: { id: 'org-1', name: 'Unit' } },
		personnel: { data: rejected },
		personnelDetailHeader: { person },
		asOf: '2026-10-06',
		overview: {
			nextDays: pending(),
			attention: pending(),
			openFollowUps: pending(),
			evaluation: pending(),
			reach: pending(),
			lastCounseling: pending(),
			latestNote: pending()
		}
	};
}

it.each([
	['person record', DetailPage],
	['import', ImportPage]
])(
	'replaces the %s page with the Personnel load error and a working retry when the streamed workspace rejects',
	async (_name, Page) => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });

		render(RouteHarness, { data: rejectedRouteData(), Layout, Page });

		expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Personnel');
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Personnel' }));
		expect(reload).toHaveBeenCalledTimes(1);
	}
);

it.each([['import', ImportPage]])(
	'shows the Personnel load error on the %s page when a refresh rejects under an already loaded layout',
	async (_name, Page) => {
		const RoutePage = Page as unknown as Component<{ data: ReturnType<typeof rejectedRouteData> }>;
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		render(RoutePage, { props: { data: rejectedRouteData() } });

		expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Personnel');
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Personnel' }));
		expect(reload).toHaveBeenCalledTimes(1);
	}
);

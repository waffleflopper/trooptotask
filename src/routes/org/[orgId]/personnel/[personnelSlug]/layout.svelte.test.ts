// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { Personnel } from '$features/personnel/contracts';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const page = vi.hoisted(() => ({ route: { id: '' } }));
vi.mock('$app/state', () => ({ page }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn() }));
vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		orgId: 'org-1',
		orgUrlSegment: 'unit',
		affordanceForFeatureAction: () => ({ allowed: true })
	})
}));

import Layout from './+layout.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const person: Personnel = {
	id: 'person-1',
	slug: 'smith-jane',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'group-alpha',
	groupName: 'Alpha',
	archivedAt: null
};

function renderAt(routeId: string) {
	stubToolbarWidths();
	page.route.id = routeId;
	return render(Layout, {
		data: {
			personnelDetailHeader: { person, basd: null, dateOfRank: null },
			personnelDetailLayout: {
				availabilityToday: Promise.resolve(null),
				tabCounts: Promise.resolve(null),
				readinessBadge: Promise.resolve({ count: 0, complete: true })
			},
			today: '2026-06-15'
		},
		children: createRawSnippet(() => ({ render: () => '<div></div>' }))
	});
}

describe('Personnel detail section navigation', () => {
	it.each([
		['/org/[orgId]/personnel/[personnelSlug]', '/org/unit/personnel/smith-jane'],
		['/org/[orgId]/personnel/[personnelSlug]/log', '/org/unit/personnel/smith-jane/log'],
		['/org/[orgId]/personnel/[personnelSlug]/archived', '/org/unit/personnel/smith-jane/archived']
	])('marks only the current section link on %s', (routeId, href) => {
		renderAt(routeId);

		const nav = screen.getByRole('navigation', { name: 'Personnel detail sections' });
		const marked = within(nav)
			.getAllByRole('link')
			.filter((link) => link.getAttribute('aria-current') === 'page');
		expect(marked.map((link) => link.getAttribute('href'))).toEqual([href]);
	});
});

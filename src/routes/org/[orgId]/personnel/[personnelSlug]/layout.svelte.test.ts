// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { Personnel } from '$features/personnel/contracts';

const page = vi.hoisted(() => ({ route: { id: '' } }));
vi.mock('$app/state', () => ({ page }));

import Layout from './+layout.svelte';

afterEach(() => cleanup());

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
	page.route.id = routeId;
	return render(Layout, {
		data: {
			shell: { kind: 'ready', org: { urlSegment: 'unit', name: 'Unit' } },
			personnelDetailHeader: { person }
		},
		children: createRawSnippet(() => ({ render: () => '<div></div>' }))
	});
}

describe('Personnel detail section navigation', () => {
	it.each([
		['/org/[orgId]/personnel/[personnelSlug]', 'Dashboard', '/org/unit/personnel/smith-jane'],
		['/org/[orgId]/personnel/[personnelSlug]/notes', 'Notes', '/org/unit/personnel/smith-jane/notes']
	])('marks only the current section link on %s', (routeId, current, href) => {
		renderAt(routeId);

		const nav = screen.getByRole('navigation', { name: 'Personnel detail sections' });
		const links = within(nav).getAllByRole('link');
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			'Dashboard',
			'Follow-ups',
			'Counselings',
			'Documents',
			'Notes',
			'Archived'
		]);
		const marked = links.filter((link) => link.getAttribute('aria-current') === 'page');
		expect(marked.map((link) => link.textContent?.trim())).toEqual([current]);
		expect(marked[0].getAttribute('href')).toBe(href);
	});
});

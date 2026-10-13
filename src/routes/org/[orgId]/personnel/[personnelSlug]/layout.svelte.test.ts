// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { Personnel } from '$features/personnel/contracts';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const page = vi.hoisted(() => ({ route: { id: '' } }));
vi.mock('$app/state', () => ({ page }));
const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));

import Layout from './+layout.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	gotoMock.mockReset();
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

describe('Personnel record toolbar', () => {
	const toolbarName = 'Personnel record controls';

	it('links Roster, Upload PDF and Add note to their pages', () => {
		renderAt('/org/[orgId]/personnel/[personnelSlug]');

		const row = within(screen.getByRole('toolbar', { name: toolbarName }));
		expect(row.getByRole('link', { name: 'Roster' }).getAttribute('href')).toBe('/org/unit/personnel');
		expect(row.getByRole('link', { name: 'Upload PDF' }).getAttribute('href')).toBe(
			'/org/unit/personnel/smith-jane/documents'
		);
		expect(row.getByRole('link', { name: 'Add note' }).getAttribute('href')).toBe(
			'/org/unit/personnel/smith-jane/notes'
		);
	});

	it('opens Roster and Upload PDF from More while Add note stays on the row', async () => {
		const widths = stubToolbarWidths();
		renderAt('/org/[orgId]/personnel/[personnelSlug]');
		await widths.foldAll();

		const row = within(screen.getByRole('toolbar', { name: toolbarName }));
		expect(row.queryByRole('link', { name: 'Roster' })).toBeNull();
		expect(row.getByRole('link', { name: 'Add note' })).toBeTruthy();

		let menu = await openToolbarMore(toolbarName);
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Upload PDF' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/unit/personnel/smith-jane/documents'));

		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		menu = await openToolbarMore(toolbarName);
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Roster' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/unit/personnel'));
	});
});

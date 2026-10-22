// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import type { AssignmentType } from '$features/calendar/contracts';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import CalendarSettingsPage from './CalendarSettingsPage.svelte';

function type(id: string, name: string, showOnCalendar: boolean, sortOrder: number): AssignmentType {
	return {
		id,
		name,
		shortName: id.toUpperCase(),
		assignTo: 'personnel',
		color: '#b91c1c',
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
		showOnCalendar,
		sortOrder
	};
}

const access = createClientAccess(() => ({
	membershipRole: 'member',
	capabilityMap: createCapabilityMap('configure')
}));
const org = {
	orgUrlSegment: 'org-1',
	get scopeSet() {
		return access.scopeSet;
	},
	affordanceForFeatureAction: access.affordanceForFeatureAction
};

function laneNames() {
	const list = screen.getByRole('list', { name: /^On the calendar/ });
	return within(list)
		.getAllByRole('switch')
		.map((toggle) => toggle.getAttribute('aria-label')?.replace(/^Show (.*) on the calendar$/, '$1'));
}

async function editAvailable(typeName: string) {
	await fireEvent.keyDown(screen.getByRole('button', { name: `More actions for ${typeName}` }), { key: 'Enter' });
	const edit = await screen.findByRole('menuitem', { name: 'Edit' });
	const available = edit.getAttribute('aria-disabled') !== 'true';
	await fireEvent.keyDown(edit, { key: 'Escape' });
	await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
	return available;
}

afterEach(() => {
	cleanup();
	dailyAssignmentsStore.load([], [], 'org-cleanup');
	vi.unstubAllGlobals();
});

it('keeps a held lane change across a Settings tab switch and saves the moves made after it', async () => {
	dailyAssignmentsStore.load(
		[
			type('sd', 'Staff Duty', true, 0),
			type('cq', 'Charge of Quarters', true, 1),
			type('gate', 'Gate Guard', false, 0)
		],
		[],
		'org-1'
	);
	const sent: unknown[] = [];
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			sent.push(JSON.parse(String(init.body)));
			if (sent.length === 1) await held;
			return Response.json({ success: true });
		})
	);
	render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
	await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/ }));

	await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Staff Duty' }), { key: 'ArrowDown' });
	await waitFor(() => expect(sent).toHaveLength(1));
	await fireEvent.click(screen.getByRole('tab', { name: /Status Types/ }));
	expect(screen.queryByRole('switch', { name: 'Show Staff Duty on the calendar' })).toBeNull();
	await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/ }));

	expect(laneNames()).toEqual(['Charge of Quarters', 'Staff Duty']);
	expect(await editAvailable('Staff Duty')).toBe(false);
	await fireEvent.click(screen.getByRole('switch', { name: 'Show Gate Guard on the calendar' }));
	expect(laneNames()).toEqual(['Charge of Quarters', 'Staff Duty', 'Gate Guard']);
	release();

	await waitFor(() => expect(sent).toHaveLength(2));
	await waitFor(async () => expect(await editAvailable('Staff Duty')).toBe(true));
	expect(sent).toEqual([
		{ laneTypeIds: ['cq', 'sd'], expectedLaneTypeIds: ['sd', 'cq'] },
		{ laneTypeIds: ['cq', 'sd', 'gate'], expectedLaneTypeIds: ['cq', 'sd'] }
	]);
	expect(laneNames()).toEqual(['Charge of Quarters', 'Staff Duty', 'Gate Guard']);
	expect(dailyAssignmentsStore.types.map((saved) => [saved.id, saved.showOnCalendar, saved.sortOrder])).toEqual([
		['cq', true, 0],
		['sd', true, 1],
		['gate', true, 2]
	]);
});

import { describe, expect, it } from 'vitest';
import type { Group } from './contracts';
import { buildGroupTree } from './groupTree';
import { canonicalGroupFocus, groupFocusLabel, groupFocusNavigation, readGroupFocus } from './groupFocus';

const group = (id: string, name: string, parentId: string | null, depth: 1 | 2 | 3): Group => ({
	id,
	name,
	sortOrder: 0,
	parentId,
	depth
});
const unitTree = buildGroupTree([
	group('plt1', '1st Platoon', null, 1),
	group('plt2', '2nd Platoon', null, 1),
	group('sq1', '1st Squad', 'plt2', 2)
]);
const platoonTree = buildGroupTree([group('plt2', '2nd Platoon', null, 1), group('sq1', '1st Squad', 'plt2', 2)]);
const url = (search: string) => new URL(`https://app.test/org/a-co/personnel${search}`);
const orgWide = { organizationWide: true };
const scoped = { organizationWide: false };

describe('readGroupFocus', () => {
	it('reads no focus as the reader’s whole view', () => {
		expect(readGroupFocus(url(''), unitTree, orgWide)).toEqual({ kind: 'focus', focus: { kind: 'all' } });
		expect(readGroupFocus(url('?group='), unitTree, orgWide)).toEqual({ kind: 'focus', focus: { kind: 'all' } });
	});

	it('reads a visible Group at any depth', () => {
		expect(readGroupFocus(url('?group=sq1'), unitTree, orgWide)).toEqual({
			kind: 'focus',
			focus: { kind: 'group', id: 'sq1' }
		});
	});

	it('reads Unassigned only for an Organization-wide reader', () => {
		expect(readGroupFocus(url('?group=unassigned'), unitTree, orgWide)).toEqual({
			kind: 'focus',
			focus: { kind: 'unassigned' }
		});
		expect(readGroupFocus(url('?group=unassigned'), platoonTree, scoped)).toEqual({ kind: 'unavailable' });
	});

	it('reports a deleted Group as unavailable instead of widening to the whole unit', () => {
		expect(readGroupFocus(url('?group=deleted-squad'), unitTree, orgWide)).toEqual({ kind: 'unavailable' });
	});

	it('reports a Group outside the reader’s coverage as unavailable', () => {
		expect(readGroupFocus(url('?group=plt1'), platoonTree, scoped)).toEqual({ kind: 'unavailable' });
	});
});

describe('groupFocusNavigation', () => {
	it('replaces history when the reader picks a focus and keeps the rest of the address', () => {
		expect(groupFocusNavigation(url('?view=month#today'), { kind: 'group', id: 'sq1' }, 'pick')).toEqual({
			href: '/org/a-co/personnel?view=month&group=sq1#today',
			replaceState: true
		});
	});

	it('pushes history when the reader drills into a Group, so Back returns to the wider view', () => {
		expect(groupFocusNavigation(url('?group=plt2'), { kind: 'group', id: 'sq1' }, 'drill')).toEqual({
			href: '/org/a-co/personnel?group=sq1',
			replaceState: false
		});
	});

	it('drops the parameter for the whole view and writes Unassigned by name', () => {
		expect(groupFocusNavigation(url('?group=sq1'), { kind: 'all' }, 'pick').href).toBe('/org/a-co/personnel');
		expect(groupFocusNavigation(url(''), { kind: 'unassigned' }, 'pick').href).toBe(
			'/org/a-co/personnel?group=unassigned'
		);
	});
});

describe('groupFocusLabel', () => {
	it('names the whole view by who is reading', () => {
		expect(groupFocusLabel(unitTree, { kind: 'all' }, orgWide)).toBe('Whole unit');
		expect(groupFocusLabel(platoonTree, { kind: 'all' }, scoped)).toBe('2nd Platoon');
		expect(
			groupFocusLabel(
				buildGroupTree([group('a', 'Alpha Team', 'x', 3), group('b', 'Bravo Team', 'x', 3)]),
				{ kind: 'all' },
				scoped
			)
		).toBe('My Groups');
	});

	it('names a focused Group by its path', () => {
		expect(groupFocusLabel(unitTree, { kind: 'group', id: 'sq1' }, orgWide)).toBe('2nd Platoon › 1st Squad');
	});
});

describe('canonicalGroupFocus', () => {
	it('treats a Group-scoped reader focusing their only root as their whole view', () => {
		expect(canonicalGroupFocus(platoonTree, { kind: 'group', id: 'plt2' }, scoped)).toEqual({ kind: 'all' });
		expect(canonicalGroupFocus(platoonTree, { kind: 'group', id: 'sq1' }, scoped)).toEqual({
			kind: 'group',
			id: 'sq1'
		});
	});

	it('keeps an Organization-wide reader’s focus on a lone top-level Group, since Unassigned sits outside it', () => {
		const oneGroup = buildGroupTree([group('plt2', '2nd Platoon', null, 1)]);

		expect(canonicalGroupFocus(oneGroup, { kind: 'group', id: 'plt2' }, orgWide)).toEqual({
			kind: 'group',
			id: 'plt2'
		});
	});
});

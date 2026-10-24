// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupHeaderContext } from '$lib/components/ui/data-table';
import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
import type { Personnel } from '../../personnel.types';
import type { SummaryState } from '../../rosterSignals';
import PersonnelGroupHeader from './PersonnelGroupHeader.svelte';

afterEach(cleanup);

const leave = { id: 'leave', name: 'Leave', color: '#c08a2b', textColor: '#000', sortOrder: 0 };

function ready(overrides: {
	presence?: 'withheld' | { present: number; away?: number };
	attention?: 'withheld' | { people: number; worst: 'red' | 'amber' | null };
}): SummaryState {
	const presence = overrides.presence ?? { present: 3, away: 1 };
	return {
		kind: 'ready',
		value: {
			people: 4,
			presence:
				presence === 'withheld'
					? { kind: 'withheld' }
					: {
							kind: 'known',
							value: {
								present: presence.present,
								byStatus: presence.away ? [{ type: leave, count: presence.away }] : []
							}
						},
			attention:
				overrides.attention === 'withheld'
					? { kind: 'withheld' }
					: { kind: 'known', value: overrides.attention ?? { people: 2, worst: 'red' } },
			chips: []
		}
	};
}

function mount(
	summary: SummaryState,
	options: { canManageGroups?: boolean; unassigned?: boolean; collapsed?: boolean; pinned?: boolean } = {}
) {
	const openGroupEditor = vi.fn();
	const onTogglePin = vi.fn();
	const toggle = vi.fn();
	const ctx = {
		summarizeSignals: () => summary,
		canManageGroups: options.canManageGroups ?? true,
		groupIdForName: (name: string) => (name === 'Alpha' ? 'group-alpha' : null),
		openGroupEditor
	} as unknown as PersonnelPageContext;
	const unassigned = options.unassigned ?? false;
	const group: GroupHeaderContext = {
		key: unassigned ? 'Unassigned' : 'Alpha',
		label: unassigned ? 'Unassigned' : 'Alpha',
		count: 4,
		collapsed: options.collapsed ?? false,
		toggle
	};
	render(PersonnelGroupHeader, {
		props: {
			group,
			people: [] as Personnel[],
			ctx,
			pinned: options.pinned ?? false,
			unassigned,
			onTogglePin
		}
	});
	return { openGroupEditor, onTogglePin, toggle };
}

describe('PersonnelGroupHeader', () => {
	it('reports how many are present with a bar that hears each status, and how many need attention', () => {
		mount(ready({}));

		expect(screen.getByText('3 of 4 present')).toBeTruthy();
		expect(screen.getByRole('img', { name: 'Strength today: 3 present, 1 Leave' })).toBeTruthy();
		expect(screen.getByText('2 need attention').className).toContain('text-danger-foreground');
	});

	it('colors one person needing attention by their worst item', () => {
		mount(ready({ attention: { people: 1, worst: 'amber' } }));

		expect(screen.getByText('1 needs attention').className).toContain('text-warning-foreground');
	});

	it('says nobody needs attention rather than showing an empty lane', () => {
		mount(ready({ attention: { people: 0, worst: null } }));

		expect(screen.getByText('None need attention')).toBeTruthy();
	});

	it('keeps the bar and the attention count on a collapsed Group', () => {
		mount(ready({}), { collapsed: true });

		expect(screen.getByRole('button', { name: 'Expand Alpha' }).getAttribute('aria-expanded')).toBe('false');
		expect(screen.getByText('3 of 4 present')).toBeTruthy();
		expect(screen.getByText('2 need attention')).toBeTruthy();
	});

	it('shows no counts while the signals load and none when they failed', () => {
		const { unmount } = render(PersonnelGroupHeader, {
			props: {
				group: { key: 'Alpha', label: 'Alpha', count: 4, collapsed: false, toggle: vi.fn() },
				people: [],
				ctx: { summarizeSignals: () => ({ kind: 'pending' }) } as unknown as PersonnelPageContext,
				pinned: false,
				unassigned: false,
				onTogglePin: vi.fn()
			}
		});
		expect(screen.queryByText(/present/)).toBeNull();
		expect(screen.queryByText(/attention/)).toBeNull();
		unmount();
		cleanup();

		mount({ kind: 'failed' });
		expect(screen.queryByRole('img')).toBeNull();
		expect(screen.queryByText(/present/)).toBeNull();
		expect(screen.queryByText(/attention/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Collapse Alpha' })).toBeTruthy();
	});

	it('shows no bar to a viewer who cannot read availability but keeps the attention count', () => {
		mount(ready({ presence: 'withheld' }));

		expect(screen.queryByRole('img')).toBeNull();
		expect(screen.queryByText(/present/)).toBeNull();
		expect(screen.getByText('2 need attention')).toBeTruthy();
	});

	it('pins from the toggle and from the menu', async () => {
		const { onTogglePin } = mount(ready({}), { pinned: true });

		expect(screen.getByRole('button', { name: 'Unpin Alpha' }).getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(screen.getByRole('button', { name: 'Unpin Alpha' }));
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Group actions for Alpha' }), { key: 'Enter' });
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Unpin' }));

		expect(onTogglePin.mock.calls).toEqual([['Alpha'], ['Alpha']]);
	});

	it('opens the Group editor on the Group from Rename and from Add people', async () => {
		const { openGroupEditor } = mount(ready({}));
		const trigger = screen.getByRole('button', { name: 'Group actions for Alpha' });

		await fireEvent.keyDown(trigger, { key: 'Enter' });
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		await fireEvent.keyDown(trigger, { key: 'Enter' });
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Add people' }));

		expect(openGroupEditor.mock.calls).toEqual([['group-alpha'], ['group-alpha']]);
	});

	it('hides Rename and Add people from a viewer who cannot manage Groups', async () => {
		mount(ready({}), { canManageGroups: false });

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Group actions for Alpha' }), { key: 'Enter' });
		await screen.findByRole('menuitem', { name: 'Pin' });

		expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'Add people' })).toBeNull();
	});

	it('names the member count for assistive technology', () => {
		mount(ready({}));

		expect(screen.getByText('4 people')).toBeTruthy();
	});

	it('offers Unassigned an Assign a Group link instead of a count, with no pin or menu', async () => {
		const { openGroupEditor } = mount(ready({}), { unassigned: true });

		expect(screen.queryByRole('button', { name: /Pin/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /Group actions/ })).toBeNull();
		expect(screen.queryByText('2 need attention')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Assign a Group' }));

		expect(openGroupEditor.mock.calls).toEqual([[null]]);
	});

	it('hides Assign a Group from a viewer who cannot manage Groups', () => {
		mount(ready({}), { unassigned: true, canManageGroups: false });

		expect(screen.queryByRole('button', { name: 'Assign a Group' })).toBeNull();
		expect(screen.getByText('2 need attention')).toBeTruthy();
	});
});

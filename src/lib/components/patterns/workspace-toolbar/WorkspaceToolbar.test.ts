// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataToolbarTest from './DataToolbarTest.svelte';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));

class FakeResizeObserver {
	static all = new Set<FakeResizeObserver>();
	#targets = new Set<Element>();
	constructor(private callback: ResizeObserverCallback) {
		FakeResizeObserver.all.add(this);
	}
	observe(target: Element) {
		this.#targets.add(target);
	}
	unobserve(target: Element) {
		this.#targets.delete(target);
	}
	disconnect() {
		this.#targets.clear();
		FakeResizeObserver.all.delete(this);
	}
	deliver(widthOf: (target: Element) => number) {
		const entries = [...this.#targets].map((target) => {
			const box = [{ inlineSize: widthOf(target), blockSize: 32 }];
			return { target, borderBoxSize: box, contentBoxSize: box };
		});
		this.callback(entries as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
	}
}

// Natural widths with no gap. With Archive menu-only, More is always counted and the full row needs
// 972px. Import, Planning, Reports, Gaps, Status, Group and View fold below 972, 872, 782, 692, 612,
// 522 and 412 respectively; below 292 only Add status, More and the search icon remain.
const naturalWidths: Record<string, number> = {
	view: 120,
	group: 110,
	status: 90,
	gaps: 80,
	reports: 90,
	planning: 90,
	import: 100,
	add: 100
};

function widthOf(available: number) {
	return (target: Element): number => {
		const element = target as HTMLElement;
		if (element.hasAttribute('data-toolbar-row')) return available;
		if (element.hasAttribute('data-toolbar-more')) return 32;
		if (element.dataset.toolbarSearchMeasure === 'field') return 160;
		if (element.dataset.toolbarSearchMeasure === 'icon') return 32;
		return naturalWidths[element.dataset.toolbarItem ?? ''] ?? 0;
	};
}

async function layOut(available: number): Promise<void> {
	for (const observer of FakeResizeObserver.all) observer.deliver(widthOf(available));
	await tick();
}

function toolbar(): HTMLElement {
	return screen.getByRole('toolbar', { name: 'Roster controls' });
}

function moreButton(): HTMLElement {
	return within(toolbar()).getByRole('button', { name: 'More Roster controls' });
}

function output(name: string): string {
	return screen.getByRole('status', { name }).textContent ?? '';
}

function description(element: HTMLElement): string {
	return (element.getAttribute('aria-describedby') ?? '')
		.split(' ')
		.filter(Boolean)
		.map((id) => document.getElementById(id)?.textContent ?? '')
		.join(' ');
}

async function openMore(): Promise<HTMLElement> {
	const trigger = moreButton();
	trigger.focus();
	await fireEvent.keyDown(trigger, { key: 'Enter' });
	return screen.findByRole('menu');
}

async function openSubmenu(name: string): Promise<void> {
	const subTrigger = screen.getByRole('menuitem', { name });
	subTrigger.focus();
	await fireEvent.keyDown(subTrigger, { key: 'ArrowRight' });
}

beforeEach(() => {
	gotoMock.mockReset();
	vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
	cleanup();
	FakeResizeObserver.all.clear();
	vi.unstubAllGlobals();
});

describe('WorkspaceToolbar', () => {
	it('shows every control on the row before it is measured, with menu-only actions in More', async () => {
		render(DataToolbarTest);

		const row = within(toolbar());
		expect(row.getByRole('group', { name: 'View mode' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Group' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Status' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Gaps only' })).toBeTruthy();
		expect(row.getByRole('link', { name: 'Reports' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Planning' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Import' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Add status' })).toBeTruthy();
		expect(row.getByRole('searchbox', { name: 'Search roster' })).toBeTruthy();
		expect(row.queryByRole('button', { name: 'Archive' })).toBeNull();

		await openMore();
		expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeTruthy();
	});

	it('has no More button when everything fits and nothing is menu-only', async () => {
		render(DataToolbarTest, { props: { withArchive: false } });
		await layOut(940);

		expect(within(toolbar()).queryByRole('button', { name: 'More Roster controls' })).toBeNull();
		expect(within(toolbar()).getByRole('button', { name: 'Import' })).toBeTruthy();

		await layOut(939);
		expect(within(toolbar()).queryByRole('button', { name: 'Import' }), 'Import folds first').toBeNull();
		expect(moreButton()).toBeTruthy();
	});

	it('keeps measuring copies out of accessible queries and tab order', async () => {
		render(DataToolbarTest);
		await layOut(972);

		expect(screen.getAllByRole('button', { name: 'Import' })).toHaveLength(1);
		const measured = document.querySelector('[data-toolbar-measure]') as HTMLElement;
		const focusable = [...measured.querySelectorAll<HTMLElement>('button, a[href], input')];
		expect(focusable.length).toBeGreaterThan(0);
		expect(focusable.filter((element) => element.tabIndex !== -1)).toEqual([]);
	});

	it('folds actions before filters and filters before the view switch', async () => {
		render(DataToolbarTest);
		const row = () => within(toolbar());

		await layOut(900);
		expect(row().queryByRole('button', { name: 'Import' })).toBeNull();
		expect(row().getByRole('button', { name: 'Planning' })).toBeTruthy();

		await layOut(650);
		expect(row().queryByRole('link', { name: 'Reports' })).toBeNull();
		expect(row().queryByRole('button', { name: 'Gaps only' })).toBeNull();
		expect(row().getByRole('button', { name: 'Status' })).toBeTruthy();
		await openMore();
		expect(screen.getByRole('menuitemcheckbox', { name: 'Gaps only' })).toBeTruthy();
	});

	it('switches a folded view from a radio group and keeps aria-pressed on the row', async () => {
		render(DataToolbarTest);
		await layOut(972);

		await fireEvent.click(within(toolbar()).getByRole('button', { name: 'Long range' }));
		expect(within(toolbar()).getByRole('button', { name: 'Long range' }).getAttribute('aria-pressed')).toBe('true');
		expect(output('View value')).toBe('long-range');

		await layOut(411);
		await openMore();
		const views = screen.getByRole('group', { name: 'View mode' });
		expect(within(views).getByRole('menuitemradio', { name: 'Long range' }).getAttribute('aria-checked')).toBe('true');
		await fireEvent.click(within(views).getByRole('menuitemradio', { name: 'Month' }));

		expect(output('View value')).toBe('month');
		expect(description(moreButton()), 'a view is never a hidden filter').toBe('');
	});

	it('changes a folded select from its submenu by keyboard', async () => {
		render(DataToolbarTest);
		await layOut(521);

		await openMore();
		await openSubmenu('Group, All groups');
		await fireEvent.click(await screen.findByRole('menuitemradio', { name: '2nd Platoon' }));
		expect(output('Group value')).toBe('second');

		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		await openMore();
		expect(screen.getByRole('menuitem', { name: 'Group, 2nd Platoon' })).toBeTruthy();
	});

	it('checks a folded toggle from More', async () => {
		render(DataToolbarTest);
		await layOut(611);

		await openMore();
		await fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Gaps only' }));
		expect(output('Gaps value')).toBe('on');

		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		await openMore();
		expect(screen.getByRole('menuitemcheckbox', { name: 'Gaps only' }).getAttribute('aria-checked')).toBe('true');
	});

	it('picks several folded multi-select options without closing, then Escape returns to More', async () => {
		render(DataToolbarTest);
		await layOut(521);

		await openMore();
		await openSubmenu('Status');
		const press = async (name: string) => {
			const option = await screen.findByRole('menuitemcheckbox', { name });
			option.focus();
			await fireEvent.keyDown(option, { key: ' ' });
		};
		await press('Present');
		await press('TDY');
		expect(output('Status value')).toBe('present,tdy');
		expect(screen.getAllByRole('menu'), 'More and its submenu stay open').toHaveLength(2);

		await press('Present');
		expect(output('Status value')).toBe('tdy');

		await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(moreButton()));
	});

	it('describes active folded filters on More and clears the description at their defaults', async () => {
		render(DataToolbarTest);
		await layOut(521);
		expect(description(moreButton())).toBe('');

		await openMore();
		await openSubmenu('Group, All groups');
		await fireEvent.click(await screen.findByRole('menuitemradio', { name: '2nd Platoon' }));
		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		expect(description(moreButton())).toBe('Hidden filters active: Group');

		await openMore();
		await fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Gaps only' }));
		await waitFor(() => expect(description(moreButton())).toBe('Hidden filters active: Group, Gaps only'));

		await layOut(972);
		expect(description(moreButton()), 'filters back on the row do not mark More').toBe('');
	});

	it('treats a multi-select holding its defaults in another order as inactive', async () => {
		render(DataToolbarTest, { props: { initialStatus: ['tdy', 'present'], statusDefaults: ['present', 'tdy'] } });
		await layOut(521);

		expect(description(moreButton())).toBe('');
	});

	it('collapses search last and describes its hidden text', async () => {
		render(DataToolbarTest, { props: { initialSearch: 'smith' } });
		await layOut(292);
		expect(within(toolbar()).getByRole('searchbox', { name: 'Search roster' })).toBeTruthy();

		await layOut(291);
		const icon = within(toolbar()).getByRole('button', { name: 'Search roster' });
		expect(description(icon)).toBe('Search text: smith');
		expect(within(toolbar()).queryByRole('searchbox')).toBeNull();
		expect(within(toolbar()).getByRole('button', { name: 'Add status' })).toBeTruthy();
	});

	it('leaves the collapsed search icon undescribed when search is empty', async () => {
		render(DataToolbarTest);
		await layOut(291);

		expect(description(within(toolbar()).getByRole('button', { name: 'Search roster' }))).toBe('');
	});

	it('moves focus to More when the focused control folds, and leaves other focus alone', async () => {
		render(DataToolbarTest);
		await layOut(972);

		const planning = within(toolbar()).getByRole('button', { name: 'Planning' });
		planning.focus();
		await layOut(900);
		expect(document.activeElement, 'folding Import does not move focus').toBe(planning);

		await layOut(800);
		await waitFor(() => expect(document.activeElement).toBe(moreButton()));
	});

	it('moves focus from a disappearing More to the control it held', async () => {
		render(DataToolbarTest, { props: { withArchive: false } });
		await layOut(900);

		moreButton().focus();
		await layOut(940);

		await waitFor(() => expect(document.activeElement).toBe(within(toolbar()).getByRole('button', { name: 'Import' })));
	});

	it('moves focus to More when an open select folds', async () => {
		render(DataToolbarTest);
		await layOut(611);

		const group = within(toolbar()).getByRole('button', { name: 'Group' });
		group.focus();
		await fireEvent.keyDown(group, { key: 'ArrowDown' });
		expect(await screen.findByRole('listbox')).toBeTruthy();

		await layOut(521);
		await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(moreButton()));
	});

	it('moves focus to More when a row menu folds while its portaled content holds focus', async () => {
		render(DataToolbarTest);
		await layOut(900);

		const planning = within(toolbar()).getByRole('button', { name: 'Planning' });
		planning.focus();
		await fireEvent.keyDown(planning, { key: 'Enter' });
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Assignment Planner' }))
		);

		await layOut(800);
		await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Assignment Planner' })).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(moreButton()));
	});

	it('opens phone search across the row, keeps typed text, and closes by Escape or Close search', async () => {
		render(DataToolbarTest);
		await layOut(291);

		await fireEvent.click(within(toolbar()).getByRole('button', { name: 'Search roster' }));
		const field = within(toolbar()).getByRole('searchbox', { name: 'Search roster' });
		await waitFor(() => expect(document.activeElement).toBe(field));
		expect(within(toolbar()).queryByRole('button', { name: 'Add status' })).toBeNull();
		expect(within(toolbar()).queryByRole('button', { name: 'More Roster controls' })).toBeNull();

		await fireEvent.input(field, { target: { value: 'jo' } });
		expect(output('Search value')).toBe('jo');
		const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		field.dispatchEvent(escape);
		expect(escape.defaultPrevented, 'native search Escape would clear the query').toBe(true);

		const icon = await within(toolbar()).findByRole('button', { name: 'Search roster' });
		await waitFor(() => expect(document.activeElement).toBe(icon));
		expect(output('Search value')).toBe('jo');
		expect(description(icon)).toBe('Search text: jo');
		expect(within(toolbar()).getByRole('button', { name: 'Add status' })).toBeTruthy();

		await fireEvent.click(icon);
		await fireEvent.click(await within(toolbar()).findByRole('button', { name: 'Close search' }));
		await waitFor(() =>
			expect(document.activeElement).toBe(within(toolbar()).getByRole('button', { name: 'Search roster' }))
		);
	});

	it('puts Close search after the open field, outside its input group', async () => {
		render(DataToolbarTest);
		await layOut(291);

		await fireEvent.click(within(toolbar()).getByRole('button', { name: 'Search roster' }));
		const field = within(toolbar()).getByRole('searchbox', { name: 'Search roster' });
		const fieldGroup = field.closest<HTMLElement>('[role="group"]');
		const close = within(toolbar()).getByRole('button', { name: 'Close search' });

		expect(fieldGroup).toBeTruthy();
		expect(within(fieldGroup as HTMLElement).queryByRole('button', { name: 'Close search' })).toBeNull();
		expect(field.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('keeps the same focused field when the row widens during phone search', async () => {
		render(DataToolbarTest);
		await layOut(291);

		await fireEvent.click(within(toolbar()).getByRole('button', { name: 'Search roster' }));
		const field = within(toolbar()).getByRole('searchbox', { name: 'Search roster' });
		await waitFor(() => expect(document.activeElement).toBe(field));

		await layOut(400);
		expect(document.activeElement).toBe(field);
		expect(within(toolbar()).queryByRole('button', { name: 'Close search' })).toBeNull();
		expect(within(toolbar()).getByRole('button', { name: 'Add status' })).toBeTruthy();

		await layOut(291);
		expect(
			within(toolbar()).getByRole('button', { name: 'Search roster' }),
			'narrowing again shows the icon, not a reopened field'
		).toBeTruthy();
	});

	it('runs a folded action after More has closed, and navigates a folded link', async () => {
		render(DataToolbarTest);
		await layOut(691);

		await openMore();
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }));
		await waitFor(() => expect(output('Runs')).toBe('import:0'));

		await openMore();
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Reports' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledTimes(1));
		expect(gotoMock.mock.calls[0]?.[0]).toBe('/reports');
	});

	it('reserves an empty icon slot on icon-less folded actions beside icon-bearing ones', async () => {
		render(DataToolbarTest);
		await layOut(691);
		await openMore();

		const leading = (name: string) => screen.getByRole('menuitem', { name }).firstElementChild;
		expect(leading('Import')?.tagName.toLowerCase()).toBe('svg');
		for (const name of ['Planning', 'Archive']) {
			const slot = leading(name);
			expect(slot?.tagName.toLowerCase(), `${name} reserves the icon slot`).toBe('span');
			expect(slot?.getAttribute('aria-hidden')).toBe('true');
			expect(slot?.childElementCount).toBe(0);
		}

		await openSubmenu('Planning');
		const planner = await screen.findByRole('menuitem', { name: 'Assignment Planner' });
		expect(planner.firstElementChild, 'a list with no icons reserves nothing').toBeNull();
	});

	it('opens a folded menu action as a submenu with destructive items last', async () => {
		render(DataToolbarTest);
		await layOut(781);

		await openMore();
		await openSubmenu('Planning');
		const submenu = (await screen.findAllByRole('menu')).at(-1) as HTMLElement;
		expect(
			within(submenu)
				.getAllByRole('menuitem')
				.map((item) => item.textContent?.trim())
		).toEqual(['Assignment Planner', 'Monthly Plan', 'Clear Plan']);
		await fireEvent.click(within(submenu).getByRole('menuitem', { name: 'Monthly Plan' }));
		await waitFor(() => expect(output('Runs')).toBe('monthly:0'));
	});

	it('cannot run a folded submenu item under a disabled parent', async () => {
		render(DataToolbarTest, { props: { planningDisabled: true } });
		await layOut(781);

		await openMore();
		await openSubmenu('Planning');
		await tick();

		expect(screen.queryByRole('menuitem', { name: 'Assignment Planner' })).toBeNull();
		expect(output('Runs')).toBe('none');
	});

	it('marks a loading action busy and runs nothing from it', async () => {
		render(DataToolbarTest, { props: { importLoading: true } });
		await layOut(972);

		const importButton = within(toolbar()).getByRole<HTMLButtonElement>('button', { name: 'Import' });
		expect([importButton.disabled, importButton.getAttribute('aria-busy')]).toEqual([true, 'true']);
		await fireEvent.click(importButton);

		await layOut(871);
		await openMore();
		const item = screen.getByRole('menuitem', { name: 'Import' });
		expect(item.getAttribute('aria-busy')).toBe('true');
		await fireEvent.click(item);
		await tick();
		expect(output('Runs')).toBe('none');
	});

	it('explains a disabled action by title and description', async () => {
		render(DataToolbarTest, { props: { importDisabledReason: 'Roster is still loading.' } });
		await layOut(972);

		const importButton = within(toolbar()).getByRole<HTMLButtonElement>('button', { name: 'Import' });
		expect([importButton.disabled, importButton.title, description(importButton)]).toEqual([
			true,
			'Roster is still loading.',
			'Roster is still loading.'
		]);
		const reports = within(toolbar()).getByRole('link', { name: 'Reports' });
		expect([reports.getAttribute('title'), description(reports)]).toEqual([null, '']);
	});

	describe('while a menu close animation is running', () => {
		beforeEach(() => {
			const running = { finished: new Promise(() => undefined), pending: false, playState: 'running' };
			Object.defineProperty(HTMLElement.prototype, 'getAnimations', { configurable: true, value: () => [running] });
		});

		afterEach(() => {
			delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
		});

		it('runs the first chosen action once More disappears before its close finishes', async () => {
			render(DataToolbarTest, { props: { withArchive: false } });
			await layOut(871);

			await openMore();
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }));
			expect(output('Runs')).toBe('none');

			await layOut(940);
			await waitFor(() => expect(output('Runs')).toBe('import:0'));
			expect(within(toolbar()).queryByRole('button', { name: 'More Roster controls' })).toBeNull();
		});

		it('runs only the first item chosen while More is closing', async () => {
			render(DataToolbarTest, { props: { withArchive: false } });
			await layOut(700);

			await openMore();
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }));
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Reports' }));
			await layOut(940);

			await waitFor(() => expect(output('Runs')).toBe('import:0'));
			expect(gotoMock.mock.calls).toEqual([]);
		});

		it('drops the chosen action when the whole toolbar unmounts before its close finishes', async () => {
			const runs: string[] = [];
			const view = render(DataToolbarTest, { props: { withArchive: false, onRun: (name: string) => runs.push(name) } });
			await layOut(871);
			await openMore();
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }));
			await layOut(940);
			await waitFor(() => expect(runs).toEqual(['import']));

			await layOut(871);
			await openMore();
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }));
			view.unmount();
			await tick();
			await new Promise((resolve) => setTimeout(resolve));

			expect(runs).toEqual(['import']);
		});
	});
});

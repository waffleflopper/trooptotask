// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import SinglePaneTest from './SinglePaneTest.svelte';
import TypeManagementWorkspaceTest from './TypeManagementWorkspaceTest.svelte';

function renderList(props: Record<string, unknown> = {}) {
	render(TypeManagementWorkspaceTest, { props });
	const grid = screen.getByRole('grid', { name: 'Types' });
	const row = (name: string) => within(grid).getByRole('row', { name });
	return { grid, row };
}

async function press(key: string) {
	await fireEvent.keyDown(document.activeElement as HTMLElement, { key });
}

describe('patterns/type-management-workspace', () => {
	afterEach(cleanup);

	it('exposes one Tab stop on the selected row and keeps row actions out of the Tab order', async () => {
		const { grid, row } = renderList();
		await tick();

		expect(row('Annual Qualification').getAttribute('aria-selected')).toBe('true');
		expect(row('Annual Qualification').getAttribute('aria-describedby')).toBeTruthy();
		expect(row('Annual Qualification').tabIndex).toBe(0);
		expect(row('CPR').tabIndex).toBe(-1);
		expect(row('Range Day').getAttribute('aria-disabled')).toBe('true');
		for (const button of within(grid).getAllByRole('button')) expect(button.tabIndex).toBe(-1);
	});

	it('moves between rows with arrows, Home and End, and between a row and its actions with Left and Right', async () => {
		const { grid, row } = renderList();
		row('Annual Qualification').focus();

		await press('ArrowDown');
		expect(document.activeElement).toBe(row('CPR'));
		await press('End');
		expect(document.activeElement).toBe(row('Range Day'));
		await press('ArrowDown');
		expect(document.activeElement).toBe(row('Range Day'));
		await press('Home');
		expect(document.activeElement).toBe(row('Annual Qualification'));
		await press('ArrowUp');
		expect(document.activeElement).toBe(row('Annual Qualification'));

		await press('ArrowRight');
		expect(document.activeElement).toBe(within(grid).getByRole('button', { name: 'Move Annual Qualification up' }));
		await press('ArrowRight');
		expect(document.activeElement).toBe(within(grid).getByRole('button', { name: 'Delete Annual Qualification' }));
		await press('ArrowRight');
		expect(document.activeElement).toBe(within(grid).getByRole('button', { name: 'Delete Annual Qualification' }));
		await press('ArrowLeft');
		await press('ArrowLeft');
		expect(document.activeElement).toBe(row('Annual Qualification'));
		await press('ArrowDown');
		expect(document.activeElement).toBe(row('CPR'));
	});

	it.each([
		{ control: 'Note for Annual Qualification', role: 'input' },
		{ control: 'Memo for Annual Qualification', role: 'contenteditable' }
	])('leaves arrow and Home/End keys to a text $role inside a row', async ({ control }) => {
		const { grid, row } = renderList({ textControls: true });
		const field = within(grid).getByLabelText(control);
		field.focus();

		for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
			expect(await fireEvent.keyDown(field, { key })).toBe(true);
			expect(document.activeElement).toBe(field);
		}
		expect(row('CPR').tabIndex).toBe(-1);
	});

	it('runs a consumer onkeydown before grid navigation and lets it veto the move', async () => {
		const seen: string[] = [];
		const { row } = renderList({
			onkeydown: (event: KeyboardEvent) => {
				seen.push(event.key);
				if (event.key === 'End') event.preventDefault();
			}
		});
		row('Annual Qualification').focus();

		await press('ArrowDown');
		expect(document.activeElement).toBe(row('CPR'));
		await press('End');
		expect(document.activeElement).toBe(row('CPR'));
		expect(seen).toEqual(['ArrowDown', 'End']);
	});

	it('selects with Enter, Space or a click, moves the Tab stop, and ignores disabled rows and action clicks', async () => {
		const { grid, row } = renderList();
		row('CPR').focus();

		await press('Enter');
		await tick();
		expect(row('CPR').getAttribute('aria-selected')).toBe('true');
		expect(row('Annual Qualification').getAttribute('aria-selected')).toBe('false');
		expect(row('CPR').tabIndex).toBe(0);
		expect(row('Annual Qualification').tabIndex).toBe(-1);

		row('Annual Qualification').focus();
		await press(' ');
		expect(row('Annual Qualification').getAttribute('aria-selected')).toBe('true');

		await fireEvent.click(within(grid).getByRole('button', { name: 'Delete CPR' }));
		expect(row('Annual Qualification').getAttribute('aria-selected')).toBe('true');

		await fireEvent.click(within(row('CPR')).getByText('Expires after 24 months'));
		expect(row('CPR').getAttribute('aria-selected')).toBe('true');

		row('Range Day').focus();
		await press('Enter');
		await fireEvent.click(within(row('Range Day')).getByText('Range Day'));
		expect(row('Range Day').getAttribute('aria-selected')).toBe('false');
		expect(row('CPR').getAttribute('aria-selected')).toBe('true');
	});

	it('hides disclosure content until its trigger is pressed', async () => {
		render(TypeManagementWorkspaceTest);
		const trigger = screen.getByRole('button', { name: /^Advanced targeting/ });
		const content = document.getElementById(trigger.getAttribute('aria-controls') ?? '');

		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(content?.hidden).toBe(true);
		expect(content?.textContent).toBe('Route-owned targeting controls.');

		await fireEvent.click(trigger);

		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(content?.hidden).toBe(false);
	});

	describe('when one pane shows at a time', () => {
		function showPanes(singlePane: boolean) {
			const listeners = new Set<(event: { matches: boolean }) => void>();
			vi.stubGlobal(
				'matchMedia',
				vi.fn((query: string) => ({
					get matches() {
						return singlePane && query === '(width < 64rem)';
					},
					media: query,
					addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
					removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
						listeners.delete(listener)
				}))
			);
			render(SinglePaneTest);
			const row = (name: string) => screen.getByRole('row', { name });
			function narrow() {
				singlePane = true;
				for (const listener of listeners) listener({ matches: true });
			}
			return { row, narrow, back: () => screen.getByRole('button', { name: 'Types' }) };
		}

		afterEach(() => vi.unstubAllGlobals());

		it('moves focus to the detail heading on select and back to the selected row on Back', async () => {
			const { row, back } = showPanes(true);
			row('CPR').focus();

			await fireEvent.click(row('CPR'));
			await tick();
			expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'CPR' }));
			expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');

			await fireEvent.click(back());
			await tick();
			expect(document.activeElement).toBe(row('CPR'));
		});

		it('moves focus to the new item detail after a create, because the list is hidden', async () => {
			showPanes(true);

			await fireEvent.click(screen.getByRole('button', { name: 'Create' }));
			await tick();
			await tick();

			expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Range Day' }));
		});

		it('moves focus to the detail heading when narrowing hides the focused list', async () => {
			const { row, narrow } = showPanes(false);
			row('CPR').focus();
			await fireEvent.click(row('CPR'));
			await tick();
			expect(document.activeElement).toBe(row('CPR'));

			narrow();

			expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'CPR' }));
		});

		it('moves focus to the selected row when narrowing hides the focused detail', async () => {
			const { row, narrow } = showPanes(false);
			screen.getByRole('heading', { name: 'Annual Qualification' }).focus();

			narrow();

			expect(document.activeElement).toBe(row('Annual Qualification'));
		});

		it('leaves focus alone on a wide layout, where both panes stay visible', async () => {
			const { row } = showPanes(false);
			row('CPR').focus();

			await fireEvent.click(row('CPR'));
			await tick();
			expect(document.activeElement).toBe(row('CPR'));

			await fireEvent.click(screen.getByRole('button', { name: 'Create' }));
			await tick();
			await tick();
			expect(document.activeElement).toBe(row('Range Day'));
		});
	});
});

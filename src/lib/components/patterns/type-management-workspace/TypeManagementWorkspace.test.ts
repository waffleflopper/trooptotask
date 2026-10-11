// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import TypeManagementWorkspaceTest from './TypeManagementWorkspaceTest.svelte';

function renderList() {
	render(TypeManagementWorkspaceTest);
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
});

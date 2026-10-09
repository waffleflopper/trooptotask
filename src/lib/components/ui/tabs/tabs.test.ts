// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import TabsTest from './TabsTest.svelte';

afterEach(cleanup);

function tabs() {
	return within(screen.getByRole('tablist', { name: 'Feedback status' })).getAllByRole('tab');
}

describe('Tabs', () => {
	it('keeps one tab stop and points every tab at its own panel', () => {
		render(TabsTest);

		expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
		for (const tab of tabs()) {
			const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
			expect(panel).toHaveAttribute('role', 'tabpanel');
			expect(panel).toHaveTextContent(`${tab.textContent?.trim()} items`);
		}
		expect(screen.getByRole('tabpanel')).toHaveTextContent('New items');
	});

	it('moves focus and selection with arrows, Home and End', async () => {
		render(TabsTest);
		const [newTab, reviewed, resolved] = tabs();
		newTab.focus();

		await fireEvent.keyDown(newTab, { key: 'ArrowRight' });
		expect(document.activeElement).toBe(reviewed);
		expect(reviewed).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('tabpanel')).toHaveTextContent('Reviewed items');
		expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);

		await fireEvent.keyDown(reviewed, { key: 'End' });
		expect(document.activeElement).toBe(resolved);
		await fireEvent.keyDown(resolved, { key: 'ArrowRight' });
		expect(document.activeElement).toBe(newTab);
		await fireEvent.keyDown(newTab, { key: 'ArrowLeft' });
		expect(document.activeElement).toBe(resolved);
		await fireEvent.keyDown(resolved, { key: 'Home' });
		expect(document.activeElement).toBe(newTab);
		expect(screen.getByRole('tabpanel')).toHaveTextContent('New items');
	});
});

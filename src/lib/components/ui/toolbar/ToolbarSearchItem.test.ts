// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ToolbarSearchItemTest from './ToolbarSearchItemTest.svelte';

describe('ToolbarSearchItem', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the full search control and preserves bound state when compacted into a trigger panel', async () => {
		render(ToolbarSearchItemTest);

		const fullSearch = screen.getByRole('searchbox', { name: 'Search personnel' });
		await fireEvent.input(fullSearch, { target: { value: '11b' } });

		expect(screen.getByTestId('bound-search').textContent).toBe('11b');

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle mode' }));
		const trigger = screen.getByRole('button', { name: 'Search personnel' });
		expect(trigger.getAttribute('title')).toBe('Search personnel');
		expect(trigger.getAttribute('data-search-active')).toBe('true');
		expect(trigger.classList.contains('toolbar-search-item__trigger--active')).toBe(true);

		await fireEvent.click(trigger);

		const compactSearch = await screen.findByRole('searchbox', { name: 'Search personnel' });
		expect((compactSearch as HTMLInputElement).value).toBe('11b');

		await fireEvent.input(compactSearch, { target: { value: 'smith' } });
		expect(screen.getByTestId('bound-search').textContent).toBe('smith');

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle mode' }));
		expect((screen.getByRole('searchbox', { name: 'Search personnel' }) as HTMLInputElement).value).toBe('smith');
	});

	it('opens compact search as an inline panel and closes it with Escape', async () => {
		render(ToolbarSearchItemTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle mode' }));
		const trigger = screen.getByRole('button', { name: 'Search personnel' });
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByRole('searchbox', { name: 'Search personnel' })).toBeNull();

		await fireEvent.keyDown(trigger, { key: 'Enter' });
		await waitFor(() => {
			expect(screen.getByRole('searchbox', { name: 'Search personnel' })).toBeTruthy();
		});
		expect(trigger.getAttribute('aria-expanded')).toBe('true');

		await fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search personnel' }), { key: 'Escape' });

		await waitFor(() => {
			expect(screen.queryByRole('searchbox', { name: 'Search personnel' })).toBeNull();
		});
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
	});
});

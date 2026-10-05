// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import PaginationTest from './PaginationTest.svelte';

describe('Pagination public page selection', () => {
	afterEach(cleanup);

	it('updates the caller page and record range by keyboard and keeps navigation within end boundaries', async () => {
		render(PaginationTest);
		const previous = screen.getByRole('button', { name: 'Go to previous page' });
		const next = screen.getByRole('button', { name: 'Go to next page' });
		expect(previous).toBeDisabled();
		expect(screen.getByLabelText('Visible records').textContent).toBe('1-10');

		const secondPage = screen.getByRole('button', { name: 'Page 2' });
		secondPage.focus();
		await fireEvent.keyDown(secondPage, { key: 'Enter' });
		expect(screen.getByLabelText('Current page').textContent).toBe('2');
		expect(screen.getByLabelText('Visible records').textContent).toBe('11-20');
		expect(secondPage).toHaveAttribute('aria-current', 'page');
		expect(document.activeElement).toBe(secondPage);
		expect(previous).toBeEnabled();

		await fireEvent.click(next);
		expect(screen.getByLabelText('Current page').textContent).toBe('3');
		expect(screen.getByLabelText('Visible records').textContent).toBe('21-25');
		expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
		expect(next).toBeDisabled();
		await fireEvent.click(next);
		expect(screen.getByLabelText('Current page').textContent).toBe('3');

		await fireEvent.click(previous);
		await fireEvent.click(previous);
		expect(screen.getByLabelText('Current page').textContent).toBe('1');
		expect(screen.getByLabelText('Visible records').textContent).toBe('1-10');
		expect(previous).toBeDisabled();
		await fireEvent.click(previous);
		expect(screen.getByLabelText('Current page').textContent).toBe('1');
	});

	it('uses caller-supplied destination pages through the Previous and Next link wrappers', async () => {
		render(PaginationTest, { initialPage: 2, usePageWrappers: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Page 1' }));
		expect(screen.getByLabelText('Current page').textContent).toBe('1');
		expect(screen.getByLabelText('Visible records').textContent).toBe('1-10');
		await fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
		expect(screen.getByLabelText('Current page').textContent).toBe('3');
		expect(screen.getByLabelText('Visible records').textContent).toBe('21-25');
	});
});

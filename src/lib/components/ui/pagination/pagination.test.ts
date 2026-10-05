// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import PaginationTest from './PaginationTest.svelte';

describe('Pagination public page selection', () => {
	afterEach(() => {
		cleanup();
		window.location.hash = '';
	});

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

	it.each([
		{ wrapper: 'Previous', destination: 'Page 1', action: 'Enter' },
		{ wrapper: 'Previous', destination: 'Page 1', action: 'Space' },
		{ wrapper: 'Previous', destination: 'Page 1', action: 'click' },
		{ wrapper: 'Next', destination: 'Page 3', action: 'Enter' },
		{ wrapper: 'Next', destination: 'Page 3', action: 'Space' },
		{ wrapper: 'Next', destination: 'Page 3', action: 'click' }
	])('keeps disabled $wrapper noninteractive during $action', async ({ destination, action }) => {
		render(PaginationTest, { initialPage: 2, usePageWrappers: true, disableWrapperDestinations: true });
		const control = screen.getByRole('button', { name: destination });
		expect.soft(control).toBeDisabled();

		if (action === 'click') {
			control.click();
			await tick();
		} else {
			control.focus();
			expect.soft(document.activeElement).not.toBe(control);
			await fireEvent.keyDown(document.activeElement!, { key: action === 'Space' ? ' ' : action });
		}

		expect.soft(screen.getByLabelText('Current page').textContent).toBe('2');
		expect(screen.getByLabelText('Visible records').textContent).toBe('11-20');
	});

	it.each([
		{ disabled: true, key: 'Enter', expectedPage: '2', expectedRange: '11-20' },
		{ disabled: true, key: ' ', expectedPage: '2', expectedRange: '11-20' },
		{ disabled: false, key: 'Enter', expectedPage: '1', expectedRange: '1-10' },
		{ disabled: false, key: ' ', expectedPage: '1', expectedRange: '1-10' }
	])(
		'honors disabled=$disabled for a caller-rendered destination with key "$key"',
		async ({ disabled, key, expectedPage, expectedRange }) => {
			render(PaginationTest, {
				initialPage: 2,
				usePageWrappers: true,
				customDestination: true,
				disableWrapperDestinations: disabled
			});
			const control = screen.getByRole('button', { name: 'Page 1' });
			control.focus();
			expect(document.activeElement).toBe(control);
			const activation = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
			await fireEvent(control, activation);
			expect.soft(activation.defaultPrevented).toBe(true);
			expect(screen.getByLabelText('Current page')).toHaveTextContent(expectedPage);
			expect(screen.getByLabelText('Visible records')).toHaveTextContent(expectedRange);
			expect(screen.getByLabelText('Caller interaction').textContent).toBe(disabled ? '' : key);
		}
	);

	it.each([
		{ disabled: true, expectedPage: '2', expectedRange: '11-20', expectedHash: '#initial-page' },
		{ disabled: false, expectedPage: '1', expectedRange: '1-10', expectedHash: '#first-page' }
	])(
		'honors disabled=$disabled for browser navigation from a caller-rendered destination',
		async ({ disabled, expectedPage, expectedRange, expectedHash }) => {
			window.location.hash = '#initial-page';
			render(PaginationTest, {
				initialPage: 2,
				usePageWrappers: true,
				customDestination: true,
				disableWrapperDestinations: disabled
			});
			const control = screen.getByRole('button', { name: 'Page 1' });
			const activation = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
			await fireEvent(control, activation);
			expect.soft(activation.defaultPrevented).toBe(disabled);
			expect.soft(window.location.hash).toBe(expectedHash);
			expect(screen.getByLabelText('Current page')).toHaveTextContent(expectedPage);
			expect(screen.getByLabelText('Visible records')).toHaveTextContent(expectedRange);
			expect(screen.getByLabelText('Caller interaction').textContent).toBe(disabled ? '' : 'click');
		}
	);

	it('does not cancel unrelated keys on a disabled caller-rendered destination', async () => {
		render(PaginationTest, {
			initialPage: 2,
			usePageWrappers: true,
			customDestination: true,
			disableWrapperDestinations: true
		});
		const control = screen.getByRole('button', { name: 'Page 1' });
		control.focus();
		const navigation = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
		await fireEvent(control, navigation);
		expect(navigation.defaultPrevented).toBe(false);
		expect(screen.getByLabelText('Current page')).toHaveTextContent('2');
		expect(screen.getByLabelText('Visible records')).toHaveTextContent('11-20');
	});
});

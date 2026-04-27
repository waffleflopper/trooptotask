// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ToolbarStatefulControlsTest from './ToolbarStatefulControlsTest.svelte';

describe('stateful toolbar controls', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders a labelled group boundary and counts active filters', async () => {
		render(ToolbarStatefulControlsTest);

		expect(screen.getByRole('group', { name: 'Filters' })).toBeTruthy();
		expect(screen.queryByText('2 active')).toBeNull();

		await fireEvent.change(screen.getByLabelText('Group filter'), { target: { value: 'bravo' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Show gaps only' }));

		expect(screen.getByTestId('state').textContent).toBe('bravo|gaps|by-group|2');
	});

	it('opens a compact group panel with an active-count trigger and preserves control state', async () => {
		render(ToolbarStatefulControlsTest, { props: { mode: 'compact' } });

		const trigger = screen.getByRole('button', { name: 'Filters' });
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('data-active-count')).toBe('0');
		expect(screen.queryByLabelText('Group filter')).toBeNull();

		await fireEvent.click(trigger);
		await fireEvent.change(await screen.findByLabelText('Group filter'), { target: { value: 'alpha' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Show gaps only' }));
		await fireEvent.click(screen.getByRole('button', { name: 'A-Z' }));

		expect(screen.getByTestId('state').textContent).toBe('alpha|gaps|alphabetical|2');
		expect(trigger.getAttribute('data-active-count')).toBe('2');
		expect(screen.getByText('2 active')).toBeTruthy();

		await fireEvent.keyDown(screen.getByTestId('filters-group-panel'), { key: 'Escape' });
		await waitFor(() => {
			expect(screen.queryByTestId('filters-group-panel')).toBeNull();
		});
		expect(trigger.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(trigger);
		expect(((await screen.findByLabelText('Group filter')) as HTMLSelectElement).value).toBe('alpha');
		expect(screen.getByRole('button', { name: 'Show gaps only' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', { name: 'A-Z' }).getAttribute('aria-pressed')).toBe('true');
	});

	it('keeps keyboard focus inside the compact group dialog and returns focus on close', async () => {
		render(ToolbarStatefulControlsTest, { props: { mode: 'compact' } });

		const trigger = screen.getByRole('button', { name: 'Filters' });
		await fireEvent.click(trigger);

		const panel = await screen.findByTestId('filters-group-panel');
		const groupFilter = screen.getByLabelText('Group filter');
		const lastViewButton = screen.getByRole('button', { name: 'By Group' });

		await waitFor(() => {
			expect(document.activeElement).toBe(groupFilter);
		});

		lastViewButton.focus();
		await fireEvent.keyDown(panel, { key: 'Tab' });
		expect(document.activeElement).toBe(groupFilter);

		await fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true });
		expect(document.activeElement).toBe(lastViewButton);

		await fireEvent.keyDown(panel, { key: 'Escape' });
		await waitFor(() => {
			expect(screen.queryByTestId('filters-group-panel')).toBeNull();
		});
		expect(document.activeElement).toBe(trigger);
	});

	it('closes the compact group panel when clicking outside it', async () => {
		render(ToolbarStatefulControlsTest, { props: { mode: 'compact' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
		expect(await screen.findByTestId('filters-group-panel')).toBeTruthy();

		await fireEvent.mouseDown(document.body);

		await waitFor(() => {
			expect(screen.queryByTestId('filters-group-panel')).toBeNull();
		});
	});

	it('passes disabled state through shared filter selects', () => {
		render(ToolbarStatefulControlsTest, { props: { disabledFilter: true } });

		expect((screen.getByLabelText('Group filter') as HTMLSelectElement).disabled).toBe(true);
	});
});

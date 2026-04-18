// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import MultiTagSelect from './MultiTagSelect.svelte';

interface TagOption {
	value: string;
	label: string;
}

const options: TagOption[] = [
	{ value: 'alpha', label: 'Alpha' },
	{ value: 'bravo', label: 'Bravo' },
	{ value: 'charlie', label: 'Charlie' }
];

function renderSelect(
	value: string[] = [],
	overrides: Partial<{ ariaLabel: string; onChange: (values: string[]) => void }> = {}
) {
	return render(MultiTagSelect, {
		props: {
			options,
			value,
			placeholder: 'Select...',
			onChange: () => {},
			...overrides
		}
	});
}

describe('MultiTagSelect', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('opens the dropdown when the input receives focus', async () => {
		const { container } = renderSelect();
		const input = container.querySelector('.mts-input') as HTMLElement;

		await fireEvent.focus(input);

		expect(container.querySelector('.mts-dropdown')).toBeTruthy();
	});

	it('uses combobox/listbox semantics and keeps the dropdown open while selecting', async () => {
		const onChange = vi.fn();
		renderSelect([], { ariaLabel: 'MOS filter', onChange });

		await fireEvent.focus(screen.getByRole('combobox', { name: 'MOS filter' }));
		const listbox = screen.getByRole('listbox', { name: 'MOS filter' });

		await fireEvent.mouseDown(within(listbox).getByRole('option', { name: 'Alpha' }));

		expect(onChange).toHaveBeenCalledWith(['alpha']);
		expect(screen.getByRole('listbox', { name: 'MOS filter' })).toBeTruthy();
	});

	it('renders selected values as removable badges', () => {
		renderSelect(['alpha'], { ariaLabel: 'MOS filter' });

		expect(screen.getByRole('button', { name: 'Remove Alpha' })).toBeTruthy();
	});

	it('closes the dropdown when focus moves outside the component', async () => {
		const { container } = renderSelect();
		const input = container.querySelector('.mts-input') as HTMLElement;

		// Open the dropdown
		await fireEvent.focus(input);
		expect(container.querySelector('.mts-dropdown')).toBeTruthy();

		// Simulate tabbing away: focusout fires on the input with a relatedTarget outside the component
		const externalButton = document.createElement('button');
		document.body.appendChild(externalButton);
		await fireEvent.focusOut(input, { relatedTarget: externalButton });
		document.body.removeChild(externalButton);

		expect(container.querySelector('.mts-dropdown')).toBeNull();
	});

	it('keeps the dropdown open when focus moves to the tag-remove button inside the component', async () => {
		const { container } = renderSelect(['alpha']);
		const input = container.querySelector('.mts-input') as HTMLElement;

		// Open the dropdown
		await fireEvent.focus(input);
		expect(container.querySelector('.mts-dropdown')).toBeTruthy();

		// focusout with relatedTarget = the remove button (still inside the component)
		const removeButton = container.querySelector('.mts-tag-remove') as HTMLElement;
		await fireEvent.focusOut(input, { relatedTarget: removeButton });

		expect(container.querySelector('.mts-dropdown')).toBeTruthy();
	});

	it('closes the dropdown when focus moves to null (focus leaves the browser window)', async () => {
		const { container } = renderSelect();
		const input = container.querySelector('.mts-input') as HTMLElement;

		await fireEvent.focus(input);
		expect(container.querySelector('.mts-dropdown')).toBeTruthy();

		await fireEvent.focusOut(input, { relatedTarget: null });

		expect(container.querySelector('.mts-dropdown')).toBeNull();
	});

	it('keeps the dropdown open while the options list scrolls', async () => {
		const { container } = renderSelect();
		const input = container.querySelector('.mts-input') as HTMLElement;

		await fireEvent.focus(input);
		const dropdown = container.querySelector('.mts-dropdown') as HTMLElement;
		expect(dropdown).toBeTruthy();

		await fireEvent.scroll(dropdown);

		expect(container.querySelector('.mts-dropdown')).toBeTruthy();
	});

	it('repositions the dropdown when selected tags change while open', async () => {
		const originalInnerHeight = window.innerHeight;
		window.innerHeight = 800;

		let rect = {
			left: 24,
			top: 100,
			right: 264,
			bottom: 140,
			width: 240,
			height: 40,
			x: 24,
			y: 100,
			toJSON: () => ({})
		};

		const { container, rerender } = renderSelect();
		const root = container.querySelector('.mts') as HTMLDivElement;
		vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect as DOMRect);

		const input = container.querySelector('.mts-input') as HTMLElement;
		await fireEvent.focus(input);

		let dropdown = container.querySelector('.mts-dropdown') as HTMLElement;
		expect(dropdown.getAttribute('style')).toContain('top: 144px');
		expect(dropdown.getAttribute('style')).toContain('max-height: 240px');

		rect = {
			...rect,
			top: 100,
			bottom: 184,
			height: 84,
			y: 100
		};

		await rerender({
			options,
			value: ['alpha', 'bravo', 'charlie'],
			placeholder: 'Select...',
			onChange: () => {}
		});

		await waitFor(() => {
			dropdown = container.querySelector('.mts-dropdown') as HTMLElement;
			expect(dropdown.getAttribute('style')).toContain('top: 188px');
			expect(dropdown.getAttribute('style')).toContain('max-height: 240px');
		});

		window.innerHeight = originalInnerHeight;
	});

	it('keeps the dropdown below the control when above has less space than below', async () => {
		const originalInnerHeight = window.innerHeight;
		window.innerHeight = 220;

		const rect = {
			left: 24,
			top: 32,
			right: 264,
			bottom: 72,
			width: 240,
			height: 40,
			x: 24,
			y: 32,
			toJSON: () => ({})
		};

		const { container } = renderSelect();
		const root = container.querySelector('.mts') as HTMLDivElement;
		vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect as DOMRect);

		const input = container.querySelector('.mts-input') as HTMLElement;
		await fireEvent.focus(input);

		const dropdown = container.querySelector('.mts-dropdown') as HTMLElement;
		const style = dropdown.getAttribute('style') ?? '';
		expect(style).toContain('top: 76px');
		expect(style).toContain('max-height: 140px');
		expect(style).not.toContain('bottom: 192px');

		window.innerHeight = originalInnerHeight;
	});
});

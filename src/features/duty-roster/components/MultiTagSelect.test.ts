// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
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

function renderSelect(value: string[] = []) {
	return render(MultiTagSelect, {
		props: {
			options,
			value,
			placeholder: 'Select...',
			onChange: () => {}
		}
	});
}

describe('MultiTagSelect', () => {
	afterEach(() => {
		cleanup();
	});

	it('opens the dropdown when the input receives focus', async () => {
		const { container } = renderSelect();
		const input = container.querySelector('.mts-input') as HTMLElement;

		await fireEvent.focus(input);

		expect(container.querySelector('.mts-dropdown')).toBeTruthy();
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
		});

		window.innerHeight = originalInnerHeight;
	});
});

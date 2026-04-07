// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import MultiTagSelect from './MultiTagSelect.svelte';
import type { TagOption } from './MultiTagSelect.svelte';

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
});

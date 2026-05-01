// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import SearchSelect from './SearchSelect.svelte';

const options = [
	{ value: 'alpha', label: 'Alpha' },
	{ value: 'bravo', label: 'Bravo', description: 'Next up in rotation' },
	{ value: 'charlie', label: 'Charlie' }
];

interface SearchSelectTestProps {
	value: string;
	placeholder: string;
	ariaLabel: string;
	clearable: boolean;
	onchange: (value: string) => void;
}

function renderSelect(overrides: Partial<SearchSelectTestProps> = {}) {
	return render(SearchSelect, {
		props: {
			options,
			value: '',
			placeholder: 'Select...',
			ariaLabel: 'Assignee',
			clearable: true,
			onchange: () => {},
			...overrides
		}
	});
}

function makeRect(overrides: Partial<DOMRect> = {}): DOMRect {
	return {
		left: 24,
		top: 100,
		right: 264,
		bottom: 140,
		width: 240,
		height: 40,
		x: 24,
		y: 100,
		toJSON: () => ({}),
		...overrides
	} as DOMRect;
}

describe('SearchSelect', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('uses button semantics while closed and combobox semantics while open', async () => {
		renderSelect();

		expect(screen.getByRole('button', { name: 'Assignee' })).toBeTruthy();
		expect(screen.queryByRole('combobox', { name: 'Assignee' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Assignee' }));

		expect(screen.getByRole('combobox', { name: 'Assignee' })).toBeTruthy();
	});

	it('renders optional secondary option text in the custom listbox', async () => {
		renderSelect();

		await fireEvent.click(screen.getByRole('button', { name: 'Assignee' }));

		const bravoOption = screen.getByRole('option', { name: 'Bravo Next up in rotation' });
		expect(bravoOption).toBeTruthy();
		expect(bravoOption.querySelector('.option-description')?.textContent).toBe('Next up in rotation');
	});

	it('clears on mouse down before focus can move away', async () => {
		const onchange = vi.fn();
		renderSelect({ value: 'alpha', onchange });

		const clearButton = screen.getByRole('button', { name: 'Clear selection' });
		expect(clearButton.getAttribute('tabindex')).toBeNull();

		await fireEvent.mouseDown(clearButton);

		expect(onchange).toHaveBeenCalledOnce();
		expect(onchange).toHaveBeenCalledWith('');
	});

	it('keeps the clear button keyboard accessible', async () => {
		const onchange = vi.fn();
		renderSelect({ value: 'alpha', onchange });

		await fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }), { detail: 0 });

		expect(onchange).toHaveBeenCalledOnce();
		expect(onchange).toHaveBeenCalledWith('');
	});

	it('repositions the fixed dropdown on scroll and resize while open', async () => {
		const originalInnerHeight = window.innerHeight;
		window.innerHeight = 800;
		let rect = makeRect();

		try {
			const { container } = renderSelect();
			const root = container.querySelector('.search-select') as HTMLDivElement;
			vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect);

			await fireEvent.click(screen.getByRole('button', { name: 'Assignee' }));

			let dropdown = container.querySelector('.dropdown') as HTMLElement;
			expect(dropdown.getAttribute('style')).toContain('top: 144px');
			expect(dropdown.getAttribute('style')).toContain('width: 240px');

			rect = makeRect({ top: 180, bottom: 220, y: 180 });
			await fireEvent.scroll(window);

			await waitFor(() => {
				dropdown = container.querySelector('.dropdown') as HTMLElement;
				expect(dropdown.getAttribute('style')).toContain('top: 224px');
			});

			rect = makeRect({ left: 48, right: 288, top: 180, bottom: 220, x: 48, y: 180 });
			await fireEvent.resize(window);

			await waitFor(() => {
				dropdown = container.querySelector('.dropdown') as HTMLElement;
				expect(dropdown.getAttribute('style')).toContain('left: 48px');
			});
		} finally {
			window.innerHeight = originalInnerHeight;
		}
	});
});

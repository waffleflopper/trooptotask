// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import FormFieldTest from './FormFieldTest.svelte';

function renderField(overrides: Record<string, unknown> = {}) {
	return render(FormFieldTest, {
		props: {
			label: 'First Name',
			id: 'first-name',
			...overrides
		}
	});
}

describe('FormField', () => {
	beforeEach(() => {
		cleanup();
	});

	describe('text input', () => {
		it('should render a label wired to an input via for/id', () => {
			renderField();
			const label = screen.getByText('First Name');
			expect(label.tagName).toBe('LABEL');
			expect(label.getAttribute('for')).toBe('first-name');

			const input = screen.getByRole('textbox');
			expect(input.getAttribute('id')).toBe('first-name');
			expect(input.tagName).toBe('INPUT');
		});
	});

	describe('select', () => {
		it('should render a select element with options', () => {
			renderField({
				label: 'Rank',
				id: 'rank',
				inputElement: 'select',
				options: [
					{ value: 'e1', label: 'PVT' },
					{ value: 'e2', label: 'PV2' }
				]
			});

			const select = screen.getByRole('combobox');
			expect(select.tagName).toBe('SELECT');
			expect(select.getAttribute('id')).toBe('rank');

			const options = select.querySelectorAll('option');
			expect(options.length).toBe(2);
			expect(options[0].textContent).toBe('PVT');
			expect(options[0].getAttribute('value')).toBe('e1');
		});
	});

	describe('textarea', () => {
		it('should render a textarea with rows', () => {
			renderField({
				label: 'Notes',
				id: 'notes',
				inputElement: 'textarea',
				rows: 5
			});

			const textarea = screen.getByRole('textbox');
			expect(textarea.tagName).toBe('TEXTAREA');
			expect(textarea.getAttribute('id')).toBe('notes');
			expect(textarea.getAttribute('rows')).toBe('5');
		});
	});

	describe('required', () => {
		it('should show required asterisk when required is true', () => {
			renderField({ required: true });
			const asterisk = screen.getByText('*');
			expect(asterisk).toBeTruthy();
			expect(asterisk.className).toContain('required');
		});
	});

	describe('error state', () => {
		it('should show error message and mark input as invalid', () => {
			renderField({ error: 'Name is required' });

			const errorEl = screen.getByText('Name is required');
			expect(errorEl).toBeTruthy();

			const input = screen.getByRole('textbox');
			expect(input.getAttribute('aria-invalid')).toBe('true');
			expect(input.getAttribute('aria-describedby')).toBe('first-name-error');
			expect(input.className).toContain('input-error');
		});
	});

	describe('hint', () => {
		it('should show hint text when provided', () => {
			renderField({ hint: 'Enter your legal first name' });
			expect(screen.getByText('Enter your legal first name')).toBeTruthy();

			const input = screen.getByRole('textbox');
			expect(input.getAttribute('aria-describedby')).toBe('first-name-hint');
		});

		it('should hide hint when error is showing', () => {
			renderField({ hint: 'Enter your legal first name', error: 'Required' });
			expect(screen.queryByText('Enter your legal first name')).toBeNull();
			expect(screen.getByText('Required')).toBeTruthy();
		});
	});

	describe('custom children', () => {
		it('should render children snippet instead of default input', () => {
			renderField({ useCustomChildren: true });
			const custom = screen.getByTestId('custom-input');
			expect(custom).toBeTruthy();
			expect(custom.getAttribute('type')).toBe('range');
		});
	});
});

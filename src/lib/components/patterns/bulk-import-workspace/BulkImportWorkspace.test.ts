// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import BulkImportStepTest from './BulkImportStepTest.svelte';
import BulkImportWorkspaceTest from './BulkImportWorkspaceTest.svelte';

afterEach(() => cleanup());

describe('BulkImportWorkspace', () => {
	async function press(name: string) {
		const button = screen.getByRole('button', { name });
		button.focus();
		await fireEvent.click(button);
		await tick();
	}

	it('moves focus to the new step heading when the step change removes the focused control', async () => {
		render(BulkImportStepTest);

		await press('Parse file');
		expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Review rows' }));

		await press('Back');
		expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Upload file' }));
	});

	it('keeps lost focus owed through a step without a heading until the next heading renders', async () => {
		render(BulkImportStepTest);

		await press('Start import');
		expect(screen.getByText('Importing rows')).toBeInTheDocument();
		expect(document.activeElement).toBe(document.body);

		await fireEvent.click(screen.getByRole('button', { name: 'Finish import from outside' }));
		await tick();

		expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Review rows' }));
	});

	it('leaves focus on a control that survives the step change', async () => {
		render(BulkImportStepTest);

		await press('Switch step');

		expect(screen.getByRole('heading', { name: 'Review rows' })).toBeInTheDocument();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Switch step' }));
	});

	it('leaves focus outside the workspace when the step changes from outside', async () => {
		render(BulkImportStepTest);

		await press('Switch step from outside');

		expect(screen.getByRole('heading', { name: 'Review rows' })).toBeInTheDocument();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Switch step from outside' }));
	});

	it('does not move focus into a workspace that immediately replaces the focused one', async () => {
		render(BulkImportStepTest);

		await press('Open other workspace');
		await new Promise((resolve) => setTimeout(resolve));

		expect(screen.getByRole('heading', { name: 'Other import' })).toBeInTheDocument();
		expect(document.activeElement).toBe(document.body);
	});

	it('renders source selection and updates selected source', async () => {
		render(BulkImportWorkspaceTest);

		const picker = screen.getByRole('radiogroup', { name: 'Choose import source' });
		expect(within(picker).getByRole('radio', { name: /Upload/ })).toHaveAttribute('aria-checked', 'true');

		await fireEvent.click(within(picker).getByRole('radio', { name: /Paste/ }));
		expect(within(picker).getByRole('radio', { name: /Paste/ })).toHaveAttribute('aria-checked', 'true');
	});

	it('renders shared file and paste input labels, descriptions, and errors', () => {
		render(BulkImportWorkspaceTest);

		const fileInput = screen.getByLabelText('Upload import file');
		expect(fileInput).toHaveAttribute('type', 'file');
		expect(fileInput).toHaveAttribute('aria-invalid', 'true');
		expect(screen.getByText('File is required')).toBeInTheDocument();

		expect(screen.getByLabelText('Paste import rows')).toBeInTheDocument();
		expect(screen.getByText('Use CSV format.')).toBeInTheDocument();
	});

	it('renders validation summary, selectable preview rows, disabled submit reason, and result summary', async () => {
		render(BulkImportWorkspaceTest);

		expect(screen.getByText('Review row status')).toBeInTheDocument();
		expect(screen.getByText('1 errors')).toBeInTheDocument();

		const table = screen.getByRole('table', { name: 'Bulk import preview' });
		expect(within(table).getByText('Avery Brooks')).toBeInTheDocument();
		expect(within(table).getByText('Valid')).toBeInTheDocument();
		expect(within(table).getByText('Missing value')).toBeInTheDocument();
		expect(within(table).getByText('Value is required.')).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: /Select import row 2/ })).toHaveAccessibleName(
			'Select import row 2: Resolve validation errors before selecting this row.'
		);

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select import row 1' }));
		expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
		expect(screen.getByText('1 selectable rows chosen from 2 preview rows')).toBeInTheDocument();
		const invalidSelection = screen.getByRole('checkbox', { name: /Select import row 2/ });
		expect(invalidSelection).toBeDisabled();
		expect(invalidSelection).not.toBeChecked();
		expect(invalidSelection).toHaveAttribute('aria-invalid', 'true');
		expect(invalidSelection).toHaveAccessibleDescription('Value is required.');
		expect(screen.getByRole('checkbox', { name: 'Select import row 1' })).not.toHaveAttribute('aria-invalid');
		await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
		expect(screen.getByText('0 of 2 selected')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select all import rows' }));
		expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: 'Select import row 1' })).toBeChecked();
		expect(invalidSelection).toBeDisabled();
		expect(invalidSelection).not.toBeChecked();

		expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
		expect(screen.getByText('Import completed with issues')).toBeInTheDocument();
		expect(screen.getByText('Select at least one valid row.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Import checked rows' })).toBeDisabled();
	});
});

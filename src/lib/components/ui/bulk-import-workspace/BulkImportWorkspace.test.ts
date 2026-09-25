// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import BulkImportWorkspaceTest from './BulkImportWorkspaceTest.svelte';

afterEach(() => cleanup());

describe('BulkImportWorkspace', () => {
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

		expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
		expect(screen.getByText('Import completed with issues')).toBeInTheDocument();
		expect(screen.getByText('Select at least one valid row.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Import checked rows' })).toBeDisabled();
	});
});

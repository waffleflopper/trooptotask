// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import TypeManagerTest from './TypeManagerTest.svelte';

interface TestItem {
	id: string;
	name: string;
	color: string;
}

const mockItems: TestItem[] = [
	{ id: '1', name: 'Alpha', color: '#ff0000' },
	{ id: '2', name: 'Bravo', color: '#00ff00' }
];

function renderManager(overrides: Record<string, unknown> = {}) {
	return render(TypeManagerTest, {
		props: {
			items: mockItems,
			onAdd: vi.fn(),
			onUpdate: vi.fn(),
			onRemove: vi.fn(),
			onClose: vi.fn(),
			getAddData: () => null,
			resetAddForm: vi.fn(),
			onEditStart: vi.fn(),
			getEditData: () => null,
			...overrides
		}
	});
}

describe('TypeManager', () => {
	beforeEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	describe('rendering', () => {
		it('should render items via itemDisplay snippet', () => {
			renderManager();
			expect(screen.getByTestId('item-1')).toBeTruthy();
			expect(screen.getByTestId('item-2')).toBeTruthy();
			expect(screen.getByTestId('item-1').textContent).toBe('Alpha');
		});

		it('should show EmptyState when no items', () => {
			renderManager({ items: [] });
			expect(screen.getByText(/no test items yet/i)).toBeTruthy();
		});
	});

	describe('add flow', () => {
		it('should call onAdd with getAddData result and resetAddForm on add click', async () => {
			const onAdd = vi.fn();
			const resetAddForm = vi.fn();
			const addData = { name: 'Charlie', color: '#0000ff' };

			renderManager({
				onAdd,
				resetAddForm,
				getAddData: () => addData
			});

			const addButton = screen.getByRole('button', { name: 'Add' });
			await fireEvent.click(addButton);

			expect(onAdd).toHaveBeenCalledWith(addData);
			expect(resetAddForm).toHaveBeenCalled();
		});

		it('should not call onAdd when getAddData returns null', async () => {
			const onAdd = vi.fn();

			renderManager({
				onAdd,
				getAddData: () => null
			});

			const addButton = screen.getByRole('button', { name: 'Add' });
			await fireEvent.click(addButton);

			expect(onAdd).not.toHaveBeenCalled();
		});
	});

	describe('edit flow', () => {
		it('should call onEditStart when edit button is clicked', async () => {
			const onEditStart = vi.fn();

			renderManager({ onEditStart });

			const editButtons = screen.getAllByTitle('Edit');
			await fireEvent.click(editButtons[0]);

			expect(onEditStart).toHaveBeenCalledWith(mockItems[0]);
		});

		it('should show edit form and call onUpdate on save', async () => {
			const onUpdate = vi.fn();
			const editData = { name: 'Updated', color: '#999' };

			renderManager({
				onUpdate,
				getEditData: () => editData
			});

			const editButtons = screen.getAllByTitle('Edit');
			await fireEvent.click(editButtons[0]);

			expect(screen.getByTestId('edit-form')).toBeTruthy();

			const saveButton = screen.getByRole('button', { name: 'Save' });
			await fireEvent.click(saveButton);

			expect(onUpdate).toHaveBeenCalledWith('1', editData);
		});
	});

	describe('delete flow', () => {
		it('should show confirm dialog and call onRemove on confirm', async () => {
			const onRemove = vi.fn();

			renderManager({ onRemove });

			const deleteButtons = screen.getAllByTitle('Remove');
			await fireEvent.click(deleteButtons[0]);

			expect(screen.getByText(/remove "Alpha"/i)).toBeTruthy();

			// ConfirmDialog has the confirm button with the confirmLabel
			const confirmButtons = screen.getAllByRole('button', { name: 'Remove' });
			// The last "Remove" button is the confirm dialog one
			await fireEvent.click(confirmButtons[confirmButtons.length - 1]);

			expect(onRemove).toHaveBeenCalledWith('1');
		});
	});
});

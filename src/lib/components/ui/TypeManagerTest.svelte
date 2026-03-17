<script lang="ts">
	import TypeManager from './TypeManager.svelte';

	interface TestItem {
		id: string;
		name: string;
		color: string;
	}

	interface Props {
		items: TestItem[];
		onAdd: (data: Omit<TestItem, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<TestItem, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
		getAddData: () => Omit<TestItem, 'id'> | null;
		resetAddForm: () => void;
		onEditStart: (item: TestItem) => void;
		getEditData: () => Partial<Omit<TestItem, 'id'>> | null;
	}

	let { items, onAdd, onUpdate, onRemove, onClose, getAddData, resetAddForm, onEditStart, getEditData }: Props =
		$props();
</script>

<TypeManager
	{items}
	{onAdd}
	{onUpdate}
	{onRemove}
	{onClose}
	{getAddData}
	{resetAddForm}
	{onEditStart}
	{getEditData}
	title="Test Manager"
	noun="Test Item"
>
	{#snippet addForm()}
		<span data-testid="add-form">Add form</span>
	{/snippet}

	{#snippet editForm()}
		<span data-testid="edit-form">Edit form</span>
	{/snippet}

	{#snippet itemDisplay(item)}
		<span data-testid="item-{item.id}">{item.name}</span>
	{/snippet}
</TypeManager>

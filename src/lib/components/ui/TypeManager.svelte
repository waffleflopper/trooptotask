<script lang="ts" generics="T extends { id: string; name: string }">
	import type { Snippet } from 'svelte';
	import { Root as TypeManagerRoot } from '$lib/components/ui/type-manager/index.js';

	interface Props {
		items: T[];
		onAdd: (data: Omit<T, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<T, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
		title: string;
		noun?: string;
		titleId?: string;
		width?: string;
		removeConfirmMessage?: (item: T) => string;
		getAddData: () => Omit<T, 'id'> | null;
		resetAddForm: () => void;
		onEditStart: (item: T) => void;
		getEditData: () => Partial<Omit<T, 'id'>> | null;
		addForm: Snippet;
		editForm: Snippet;
		itemDisplay: Snippet<[T]>;
	}

	let {
		items,
		onAdd,
		onUpdate,
		onRemove,
		onClose,
		title,
		noun = 'Item',
		titleId,
		width = '560px',
		removeConfirmMessage,
		getAddData,
		resetAddForm,
		onEditStart,
		getEditData,
		addForm,
		editForm,
		itemDisplay
	}: Props = $props();
</script>

<TypeManagerRoot
	{items}
	{onAdd}
	{onUpdate}
	{onRemove}
	{onClose}
	{title}
	{noun}
	{titleId}
	{width}
	{removeConfirmMessage}
	{getAddData}
	{resetAddForm}
	{onEditStart}
	{getEditData}
	{addForm}
	{editForm}
	{itemDisplay}
/>

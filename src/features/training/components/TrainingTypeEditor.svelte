<script lang="ts">
	import { untrack } from 'svelte';
	import { formatToday } from '$lib/utils/dates';
	import { trainingTypesStore } from '../stores/trainingTypes.svelte';
	import type { LoadedTrainingTypeEditor } from '../trainingTypeEditor';
	import TrainingTypeSheet from './TrainingTypeSheet.svelte';

	/** The Training types page's sheet, opened on its own over data from `loadTrainingTypeEditor`. */
	let {
		catalog,
		typeId,
		onChanged,
		onClose
	}: {
		catalog: LoadedTrainingTypeEditor;
		/** The type to edit, or null for a new one. */
		typeId: string | null;
		/** A save or delete went through. */
		onChanged: () => void;
		onClose: () => void;
	} = $props();

	const { org, trainingTypes, personnel, rankCatalog } = untrack(() => catalog);
	// The sheet saves through the store, which must point at this Organization's catalog.
	trainingTypesStore.load(trainingTypes, org.orgId);
	const ordered = [...trainingTypes].sort((a, b) => a.sortOrder - b.sortOrder);
	const type = ordered.find((entry) => entry.id === typeId) ?? null;
	const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
</script>

<TrainingTypeSheet
	{org}
	{type}
	position={type ? ordered.indexOf(type) + 1 : 0}
	catalogSize={ordered.length}
	nextSortOrder={ordered.reduce((next, entry) => Math.max(next, entry.sortOrder + 1), 0)}
	{personnel}
	{rankCatalog}
	today={formatToday()}
	onSaved={onChanged}
	onDeleted={onChanged}
	{onClose}
	returnFocus={() => {
		if (opener?.isConnected) opener.focus();
	}}
/>

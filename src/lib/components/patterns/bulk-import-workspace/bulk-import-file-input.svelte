<script lang="ts">
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	type Props = {
		id?: string;
		label?: string;
		description?: string;
		error?: string;
		accept?: string;
		disabled?: boolean;
		files?: FileList;
		onFilesChange?: (files: FileList | undefined) => void;
	};

	let {
		id,
		label = 'Upload file',
		description = 'CSV and XLSX files are accepted.',
		error,
		accept = '.csv,.xlsx',
		disabled = false,
		files = $bindable(),
		onFilesChange
	}: Props = $props();
	const uid = $props.id();
	const inputId = $derived(id ?? `${uid}-file`);
</script>

<Field.Root data-invalid={!!error}>
	<Field.Label for={inputId}>{label}</Field.Label>
	<Input id={inputId} type="file" {accept} {disabled} bind:files onchange={() => onFilesChange?.(files)} />
	{#if description}
		<Field.Description>{description}</Field.Description>
	{/if}
	{#if error}
		<Field.Error>{error}</Field.Error>
	{/if}
</Field.Root>

<script lang="ts">
	import * as Field from '$lib/components/ui/field/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	type Props = {
		id?: string;
		label?: string;
		description?: string;
		error?: string;
		placeholder?: string;
		disabled?: boolean;
		value?: string;
		rows?: number;
	};

	let {
		id,
		label = 'Paste rows',
		description,
		error,
		placeholder = 'Paste CSV rows here',
		disabled = false,
		value = $bindable(''),
		rows = 8
	}: Props = $props();
	const uid = $props.id();
	const textareaId = $derived(id ?? `${uid}-paste`);
	const descriptionId = $derived(`${textareaId}-description`);
	const errorId = $derived(`${textareaId}-error`);
</script>

<Field.Root data-invalid={!!error}>
	<Field.Label for={textareaId}>{label}</Field.Label>
	<Textarea
		id={textareaId}
		bind:value
		{placeholder}
		{disabled}
		{rows}
		aria-describedby={error
			? `${description ? descriptionId : ''} ${errorId}`.trim()
			: description
				? descriptionId
				: undefined}
		aria-invalid={!!error}
	/>
	{#if description}
		<Field.Description id={descriptionId}>{description}</Field.Description>
	{/if}
	{#if error}
		<Field.Error id={errorId}>{error}</Field.Error>
	{/if}
</Field.Root>

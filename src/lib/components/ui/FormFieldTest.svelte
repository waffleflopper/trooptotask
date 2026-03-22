<script lang="ts">
	import FormField from './FormField.svelte';

	interface Props {
		label: string;
		id: string;
		inputElement?: 'input' | 'select' | 'textarea';
		name?: string;
		type?: string;
		placeholder?: string;
		value?: string;
		required?: boolean;
		error?: string;
		hint?: string;
		disabled?: boolean;
		options?: { value: string; label: string }[];
		rows?: number;
		useCustomChildren?: boolean;
	}

	let {
		label,
		id,
		inputElement = 'input',
		name,
		type,
		placeholder,
		value,
		required,
		error,
		hint,
		disabled,
		options,
		rows,
		useCustomChildren = false
	}: Props = $props();
</script>

{#if useCustomChildren}
	<FormField {label} {id} {error} {hint} {required}>
		<input {id} type="range" min="0" max="100" data-testid="custom-input" />
	</FormField>
{:else}
	<FormField
		{label}
		{id}
		{inputElement}
		{name}
		{type}
		{placeholder}
		{value}
		{required}
		{error}
		{hint}
		{disabled}
		{options}
		{rows}
	/>
{/if}

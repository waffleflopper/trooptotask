<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		id: string;
		inputElement?: 'input' | 'select' | 'textarea';
		name?: string;
		type?: string;
		placeholder?: string;
		value?: string | boolean;
		required?: boolean;
		error?: string;
		hint?: string;
		disabled?: boolean;
		options?: { value: string; label: string }[];
		rows?: number;
		children?: Snippet;
	}

	let {
		label,
		id,
		inputElement = 'input',
		name,
		type = 'text',
		placeholder,
		value = $bindable(''),
		required = false,
		error,
		hint,
		disabled = false,
		options = [],
		rows = 3,
		children
	}: Props = $props();

	const describedBy = $derived(error ? `${id}-error` : hint ? `${id}-hint` : undefined);
	const inputClass = $derived(error ? 'input input-error' : 'input');
</script>

<div class="form-field">
	<label for={id}>
		{label}
		{#if required}<span class="required" aria-hidden="true">*</span>{/if}
	</label>

	{#if children}
		{@render children()}
	{:else if inputElement === 'select'}
		<select
			{id}
			{name}
			{disabled}
			class={inputClass}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			bind:value
		>
			{#each options as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	{:else if inputElement === 'textarea'}
		<textarea
			{id}
			{name}
			{placeholder}
			{disabled}
			{rows}
			class={inputClass}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			bind:value
		></textarea>
	{:else}
		<input
			{id}
			{name}
			{type}
			{placeholder}
			{disabled}
			class={inputClass}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			bind:value
		/>
	{/if}

	{#if error}
		<span class="field-error" id="{id}-error">{error}</span>
	{:else if hint}
		<span class="field-hint" id="{id}-hint">{hint}</span>
	{/if}
</div>

<style>
	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	label {
		font-family: var(--font-body);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--field-label);
	}

	.required {
		color: var(--field-error);
		margin-left: 2px;
	}

	.input {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--field-border);
		border-radius: var(--radius-sm);
		background: var(--field-bg);
		color: var(--color-text);
		font-family: var(--font-body);
		font-size: var(--font-size-base);
		transition: border-color var(--transition-fast);
	}

	.input:focus {
		outline: none;
		border-color: var(--field-border-focus);
	}

	.input-error {
		border-color: var(--field-error);
	}

	.field-error {
		font-size: var(--font-size-sm);
		color: var(--field-error);
	}

	.field-hint {
		font-size: var(--font-size-sm);
		color: var(--field-help);
	}
</style>

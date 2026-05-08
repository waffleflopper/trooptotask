<script lang="ts">
	/**
	 * @deprecated Use the compound shadcn-backed field primitives from
	 * `$lib/components/ui/field` with `Input`, `Textarea`, `NativeSelect`,
	 * `Select`, `Combobox`, or `MultiSelect` for new work.
	 */
	import type { Snippet } from 'svelte';

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
		children?: Snippet;
		action?: Snippet;
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
		children,
		action
	}: Props = $props();

	const errorId = $derived(`${id}-error`);
	const hintId = $derived(`${id}-hint`);
	const describedBy = $derived(error ? errorId : hint ? hintId : undefined);
	const inputClass = $derived(error ? 'input input-error' : 'input');
</script>

<div class="form-field">
	<label class="field-label" for={id}>
		{label}
		{#if required}<span class="required" aria-hidden="true">*</span>{/if}
	</label>

	{#if children}
		<div class="field-control custom-control">
			{@render children()}
		</div>
	{:else if inputElement === 'select'}
		<div class="field-control">
			<select
				{id}
				{name}
				{disabled}
				{required}
				class={`${inputClass} select`}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy}
				bind:value
				onchange={(event) => {
					value = (event.currentTarget as HTMLSelectElement).value;
				}}
			>
				{#each options as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	{:else if inputElement === 'textarea'}
		<div class="field-control">
			<textarea
				{id}
				{name}
				{placeholder}
				{disabled}
				{required}
				{rows}
				class={inputClass}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy}
				bind:value
			></textarea>
		</div>
	{:else}
		<div class="field-control">
			<input
				{id}
				{name}
				{type}
				{placeholder}
				{disabled}
				{required}
				class={inputClass}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy}
				bind:value
			/>
			{#if action}
				{@render action()}
			{/if}
		</div>
	{/if}

	<div class="field-support" aria-live={error ? 'polite' : undefined}>
		{#if error}
			<span class="field-error" id={errorId}>{error}</span>
		{:else if hint}
			<span class="field-hint" id={hintId}>{hint}</span>
		{/if}
	</div>
</div>

<style>
	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--field-stack-gap);
	}

	.field-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--field-label);
	}

	.required {
		color: var(--field-error);
		margin-left: var(--sp-1);
	}

	.field-control {
		position: relative;
	}

	.field-control :global(textarea.input) {
		min-height: 112px;
		resize: vertical;
	}

	.input-error {
		border-color: var(--field-error);
	}

	.field-error {
		font-size: var(--text-xs);
		line-height: 1.4;
		color: var(--field-error);
	}

	.field-hint {
		font-size: var(--text-xs);
		line-height: 1.4;
		color: var(--field-help);
	}
</style>

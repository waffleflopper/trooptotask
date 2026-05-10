<script lang="ts">
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type InputElement = 'input' | 'textarea';

	interface Props {
		label: string;
		id: string;
		inputElement?: InputElement;
		name?: string;
		type?: string;
		placeholder?: string;
		value?: string;
		required?: boolean;
		error?: string;
		hint?: string;
		disabled?: boolean;
		rows?: number;
		inputClass?: string;
		children?: Snippet;
		action?: Snippet;
		oninput?: (event: Event) => void;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
		maxlength?: number;
		'data-testid'?: string;
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
		rows = 3,
		inputClass,
		children,
		action,
		oninput,
		autocomplete,
		inputmode,
		maxlength,
		'data-testid': dataTestId
	}: Props = $props();

	const errorId = $derived(`${id}-error`);
	const hintId = $derived(`${id}-hint`);
	const describedBy = $derived(error ? errorId : hint ? hintId : undefined);
	const controlClass = $derived(cn(action && 'pr-9', inputClass));
</script>

<Field.Root data-invalid={error ? 'true' : undefined}>
	<Field.Label for={id} class="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
		{label}
		{#if required}<span class="text-destructive" aria-hidden="true">*</span>{/if}
	</Field.Label>

	{#if children}
		<div class="relative">
			{@render children()}
			{@render action?.()}
		</div>
	{:else if inputElement === 'textarea'}
		<Textarea
			{id}
			{name}
			{placeholder}
			{disabled}
			{required}
			{rows}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			bind:value
			class={controlClass}
			{oninput}
			data-testid={dataTestId}
		/>
	{:else}
		<div class="relative">
			<Input
				{id}
				{name}
				{type}
				{placeholder}
				{disabled}
				{required}
				{autocomplete}
				{inputmode}
				{maxlength}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy}
				bind:value
				class={controlClass}
				{oninput}
				data-testid={dataTestId}
			/>
			{@render action?.()}
		</div>
	{/if}

	{#if error}
		<Field.Error id={errorId}>{error}</Field.Error>
	{:else if hint}
		<Field.Description id={hintId}>{hint}</Field.Description>
	{/if}
</Field.Root>

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
		optional?: boolean;
		children?: Snippet;
		action?: Snippet;
		labelAction?: Snippet;
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
		optional = false,
		children,
		action,
		labelAction,
		oninput,
		autocomplete,
		inputmode,
		maxlength,
		'data-testid': dataTestId
	}: Props = $props();

	const errorId = $derived(`${id}-error`);
	const hintId = $derived(`${id}-hint`);
	const describedBy = $derived(error ? errorId : hint ? hintId : undefined);
	const controlClass = $derived(
		cn(
			'bg-card px-3.5 font-body text-base md:text-base',
			inputElement === 'input' && 'h-11',
			action && 'pr-11',
			inputClass
		)
	);
	const labelClass = 'font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-foreground uppercase';
</script>

<Field.Root data-invalid={error ? 'true' : undefined} class="relative gap-2">
	<div class="flex items-baseline justify-between gap-4">
		<Field.Label for={id} class={labelClass}>{label}</Field.Label>
		{#if optional}
			<span class={cn(labelClass, 'text-muted-foreground')}>Optional</span>
		{/if}
	</div>

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

	{#if labelAction}
		<!-- After the control in the DOM so Tab moves from the label straight into the field. -->
		<div class="absolute -top-0.5 right-0 w-fit!">{@render labelAction()}</div>
	{/if}

	{#if error}
		<Field.Error id={errorId}>{error}</Field.Error>
	{:else if hint}
		<Field.Description id={hintId} class="flex gap-2 text-[13px] leading-[19px]">
			<span class="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
			{hint}
		</Field.Description>
	{/if}
</Field.Root>

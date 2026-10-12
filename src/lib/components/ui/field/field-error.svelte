<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { getFieldContext } from './context.svelte.js';

	let {
		ref = $bindable(null),
		id: idProp,
		class: className,
		children,
		errors,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		children?: Snippet;
		errors?: { message?: string }[];
	} = $props();

	const hasContent = $derived.by(() => {
		// has slotted error
		if (children) return true;

		// no errors
		if (!errors || errors.length === 0) return false;

		// has an error but no message
		if (errors.length === 1 && !errors[0]?.message) {
			return false;
		}

		return true;
	});

	const uid = $props.id();
	const id = $derived(idProp ?? `${uid}-error`);
	const field = getFieldContext();

	const isMultipleErrors = $derived(errors && errors.length > 1);
	const singleErrorMessage = $derived(errors && errors.length === 1 && errors[0]?.message);
</script>

{#if hasContent}
	<div
		bind:this={ref}
		{id}
		{@attach () => field?.register('error', id)}
		role="alert"
		data-slot="field-error"
		class={cn('text-danger-foreground text-sm font-normal', className)}
		{...restProps}
	>
		{#if children}
			{@render children()}
		{:else if singleErrorMessage}
			{singleErrorMessage}
		{:else if isMultipleErrors}
			<ul class="ml-4 flex list-disc flex-col gap-1">
				{#each errors ?? [] as error, index (index)}
					{#if error?.message}
						<li>{error.message}</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</div>
{/if}

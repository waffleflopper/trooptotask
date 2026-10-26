<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '$lib/utils.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import { getAccordionContentId } from './accordion-context.js';

	let {
		ref = $bindable(null),
		class: className,
		level = 3,
		indicator = 'chevron',
		children,
		...restProps
	}: WithoutChild<AccordionPrimitive.TriggerProps> & {
		level?: AccordionPrimitive.HeaderProps['level'];
		indicator?: 'chevron' | 'sign';
	} = $props();

	const contentId = getAccordionContentId();
</script>

<AccordionPrimitive.Header {level} class="flex">
	<AccordionPrimitive.Trigger
		data-slot="accordion-trigger"
		aria-controls={contentId}
		bind:ref
		class={cn(
			'focus-visible:ring-ring/50 focus-visible:border-ring focus-visible:after:border-ring **:data-[slot=accordion-trigger-icon]:text-muted-foreground rounded-lg py-2.5 text-left text-sm font-medium hover:underline focus-visible:ring-3 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 group/accordion-trigger relative flex flex-1 items-start justify-between border border-transparent transition-all outline-none disabled:pointer-events-none disabled:opacity-50',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if indicator === 'sign'}
			<span
				data-slot="accordion-trigger-icon"
				class="pointer-events-none shrink-0 text-center font-mono text-[0.8125rem] leading-4"
				aria-hidden="true"
			>
				<span class="group-aria-expanded/accordion-trigger:hidden">+</span>
				<span class="hidden text-accent-text group-aria-expanded/accordion-trigger:inline">−</span>
			</span>
		{:else}
			<ChevronDownIcon
				data-slot="accordion-trigger-icon"
				class="cn-accordion-trigger-icon pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
			/>
			<ChevronUpIcon
				data-slot="accordion-trigger-icon"
				class="cn-accordion-trigger-icon pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
			/>
		{/if}
	</AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>

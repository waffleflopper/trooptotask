<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import SetupFooterBar from './SetupFooterBar.svelte';
	import { getSetupFlow, type SetupStepSave } from './setupFlow.svelte';

	let {
		save,
		blocked = null,
		note = 'Changes save as you make them',
		continueLabel
	}: {
		/** Replaces the default save, which records the step reviewed unless its data already makes it Done. */
		save?: SetupStepSave;
		/** Why Continue is unavailable. Shown in place of the note while set. */
		blocked?: string | null;
		note?: string;
		continueLabel?: string;
	} = $props();

	const flow = getSetupFlow();
	const id = $props.id();
	const label = $derived(continueLabel ?? `Continue to ${flow.next?.title ?? 'Done'}`);
</script>

<SetupFooterBar error={flow.error}>
	{#if flow.previous}
		<Button
			variant="outline"
			size="lg"
			class="max-sm:size-10 max-sm:border-chrome-border max-sm:bg-transparent max-sm:text-chrome-text max-sm:hover:bg-chrome-hover"
			href={flow.href(flow.previous.slug)}
		>
			<ChevronLeft data-icon="inline-start" aria-hidden="true" />
			<span class="max-sm:sr-only">{flow.previous.title}</span>
			<span class="sr-only sm:hidden">Back</span>
		</Button>
	{/if}
	<p
		id="{id}-note"
		class="min-w-0 flex-1 text-right font-mono max-sm:min-w-16 text-[11px] leading-[14px] tracking-[0.04em] text-muted-foreground max-sm:line-clamp-2 max-sm:text-left max-sm:font-sans max-sm:text-[13px] max-sm:leading-[18px] max-sm:tracking-normal max-sm:text-chrome-text-muted"
	>
		{blocked ?? note}
	</p>
	<Button
		size="lg"
		class="max-sm:h-auto max-sm:min-h-10 max-sm:shrink max-sm:bg-chrome-accent max-sm:px-4 max-sm:py-2 max-sm:text-left max-sm:text-[15px] max-sm:font-semibold max-sm:whitespace-normal max-sm:text-chrome"
		disabled={blocked !== null}
		aria-describedby={blocked !== null ? `${id}-note` : undefined}
		aria-busy={flow.pending || undefined}
		aria-disabled={flow.pending ? 'true' : undefined}
		onclick={() => flow.continue(save)}
	>
		{label}
		{#if flow.pending}
			<Spinner data-icon="inline-end" aria-label="Saving" />
		{:else}
			<ChevronRight data-icon="inline-end" aria-hidden="true" />
		{/if}
	</Button>
</SetupFooterBar>

<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils.js';

	let {
		title,
		hint,
		accept,
		error = null,
		disabled = false,
		onFiles,
		ref = $bindable(null),
		class: className
	}: {
		title: string;
		hint: string;
		/** The picker's file filter. */
		accept?: string;
		/** A message about the last offered files, shown inside the zone. */
		error?: string | null;
		disabled?: boolean;
		/** Called with every file dropped or picked; the owner decides which it can take. */
		onFiles: (files: File[]) => void;
		/** The file input, so an owner can move focus to it. */
		ref?: HTMLInputElement | null;
		class?: string;
	} = $props();

	let dragging = $state(false);

	function acceptsDrag(event: DragEvent) {
		return !disabled && event.dataTransfer?.types.includes('Files') === true;
	}

	function dragOver(event: DragEvent) {
		if (!acceptsDrag(event)) return;
		event.preventDefault();
		dragging = true;
	}

	function dragLeave(event: DragEvent) {
		if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) dragging = false;
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (disabled) return;
		const files = [...(event.dataTransfer?.files ?? [])];
		if (files.length > 0) onFiles(files);
	}

	function pick(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const files = [...(input.files ?? [])];
		input.value = '';
		if (files.length > 0) onFiles(files);
	}
</script>

<label
	data-slot="dropzone"
	class={cn(
		'flex cursor-pointer flex-col items-center gap-2.5 rounded-md border-[1.5px] border-dashed bg-muted px-5 py-7 text-center transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:border-muted-foreground/60',
		dragging && 'border-accent bg-accent/10',
		error && 'border-destructive',
		disabled && 'pointer-events-none opacity-60',
		className
	)}
	ondragenter={dragOver}
	ondragover={dragOver}
	ondragleave={dragLeave}
	ondrop={drop}
>
	<Input
		bind:ref
		type="file"
		class="sr-only"
		{accept}
		{disabled}
		aria-invalid={error ? true : undefined}
		onchange={pick}
	/>
	<UploadIcon class="size-7 text-foreground" strokeWidth={1.6} aria-hidden="true" />
	<span class="text-[15px] leading-5 font-semibold text-foreground">{title}</span>
	<span class="text-[13px] leading-[18px] text-muted-foreground">{hint}</span>
	{#if error}
		<span role="alert" class="text-[13px] leading-[18px] font-medium text-danger-foreground">{error}</span>
	{/if}
</label>

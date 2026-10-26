<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils.js';
	import { fileDrop } from './file-drop';

	let {
		title,
		hint,
		accept,
		error = null,
		onFiles,
		ref = $bindable(null),
		class: className
	}: {
		title: string;
		hint: string;
		accept?: string;
		error?: string | null;
		/** Called with every file dropped or picked; the owner decides which it can take. */
		onFiles: (files: File[]) => void;
		/** The file input, so an owner can move focus to it. */
		ref?: HTMLInputElement | null;
		class?: string;
	} = $props();

	let dragging = $state(false);

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
		className
	)}
	{@attach fileDrop({ onFiles, onDraggingChange: (next) => (dragging = next) })}
>
	<Input bind:ref type="file" class="sr-only" {accept} aria-invalid={error ? true : undefined} onchange={pick} />
	<UploadIcon class="size-7 text-foreground" strokeWidth={1.6} aria-hidden="true" />
	<span class="text-[15px] leading-5 font-semibold text-foreground">{title}</span>
	<span class="text-[13px] leading-[18px] text-muted-foreground">{hint}</span>
	{#if error}
		<span role="alert" class="text-[13px] leading-[18px] font-medium text-danger-foreground">{error}</span>
	{/if}
</label>

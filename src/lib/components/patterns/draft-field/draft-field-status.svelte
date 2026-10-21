<script lang="ts" generics="T">
	import { cn } from '$lib/utils.js';
	import type { FieldDraft } from './field-draft.svelte';

	let { draft, was, class: className }: { draft: FieldDraft<T>; was: string; class?: string } = $props();
</script>

<span
	data-slot="draft-field-status"
	class={cn(
		'font-mono text-xs leading-5',
		draft.changed ? 'font-semibold text-warning-foreground' : 'text-muted-foreground',
		className
	)}
>
	{draft.changed ? `Unsaved · was ${was}` : 'Saved'}
</span>

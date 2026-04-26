<script lang="ts">
	import { BookOpen, ChartNoAxesColumn, ClipboardCheck, Download, Upload } from '@lucide/svelte';
	import type { ToolbarActionIcon } from './toolbar.types';

	interface Props {
		icon: ToolbarActionIcon;
	}

	let { icon }: Props = $props();
</script>

{#if icon === 'download'}
	<Download size={16} strokeWidth={2} aria-hidden="true" />
{:else if icon === 'upload'}
	<Upload size={16} strokeWidth={2} aria-hidden="true" />
{:else if icon === 'book-open'}
	<BookOpen size={16} strokeWidth={2} aria-hidden="true" />
{:else if icon === 'chart'}
	<ChartNoAxesColumn size={16} strokeWidth={2} aria-hidden="true" />
{:else if icon === 'clipboard-check'}
	<ClipboardCheck size={16} strokeWidth={2} aria-hidden="true" />
{/if}

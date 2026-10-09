<script lang="ts">
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Download from '@lucide/svelte/icons/download';
	import Printer from '@lucide/svelte/icons/printer';
	import Settings from '@lucide/svelte/icons/settings';
	import Upload from '@lucide/svelte/icons/upload';
	import type { WorkspaceToolbarIcon } from './types.js';

	type Props = {
		icon?: WorkspaceToolbarIcon;
	};

	let { icon }: Props = $props();

	const Icon = $derived(
		icon === 'book-open'
			? BookOpen
			: icon === 'calendar-days'
				? CalendarDays
				: icon === 'chart'
					? BarChart3
					: icon === 'clipboard-check'
						? ClipboardCheck
						: icon === 'clipboard-list'
							? ClipboardList
							: icon === 'download'
								? Download
								: icon === 'printer'
									? Printer
									: icon === 'settings'
										? Settings
										: icon === 'upload'
											? Upload
											: null
	);
</script>

{#if Icon}
	<Icon aria-hidden="true" />
{/if}

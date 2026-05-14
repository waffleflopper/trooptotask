<script lang="ts">
	import {
		BarChart3,
		BookOpen,
		CalendarDays,
		ClipboardCheck,
		ClipboardList,
		Download,
		Printer,
		Settings,
		Upload
	} from '@lucide/svelte';
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

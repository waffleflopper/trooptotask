<script lang="ts">
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Download from '@lucide/svelte/icons/download';
	import Plus from '@lucide/svelte/icons/plus';
	import Printer from '@lucide/svelte/icons/printer';
	import Settings from '@lucide/svelte/icons/settings';
	import Upload from '@lucide/svelte/icons/upload';
	import type { WorkspaceToolbarIcon } from './types.js';

	type Props = {
		icon?: WorkspaceToolbarIcon;
	};

	let { icon }: Props = $props();

	const icons = {
		'book-open': BookOpen,
		'calendar-days': CalendarDays,
		chart: BarChart3,
		'clipboard-check': ClipboardCheck,
		'clipboard-list': ClipboardList,
		download: Download,
		plus: Plus,
		printer: Printer,
		settings: Settings,
		upload: Upload
	} satisfies Record<WorkspaceToolbarIcon, unknown>;

	const Icon = $derived(icon ? icons[icon] : null);
</script>

{#if Icon}
	<Icon aria-hidden="true" />
{/if}

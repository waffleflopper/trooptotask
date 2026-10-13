<script lang="ts">
	import Archive from '@lucide/svelte/icons/archive';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Download from '@lucide/svelte/icons/download';
	import FilePlus2 from '@lucide/svelte/icons/file-plus-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Printer from '@lucide/svelte/icons/printer';
	import Settings from '@lucide/svelte/icons/settings';
	import Upload from '@lucide/svelte/icons/upload';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import type { WorkspaceToolbarIcon } from './toolbar-types.js';

	type Props = {
		icon?: WorkspaceToolbarIcon;
		/** Keep an icon-sized empty box when there is no icon, so sibling labels line up. */
		reserve?: boolean;
	};

	let { icon, reserve = false }: Props = $props();

	const icons = {
		archive: Archive,
		'arrow-left': ArrowLeft,
		'book-open': BookOpen,
		'calendar-days': CalendarDays,
		chart: BarChart3,
		'clipboard-check': ClipboardCheck,
		'clipboard-list': ClipboardList,
		download: Download,
		'file-plus': FilePlus2,
		plus: Plus,
		printer: Printer,
		settings: Settings,
		upload: Upload,
		'user-plus': UserPlus
	} satisfies Record<WorkspaceToolbarIcon, unknown>;

	const Icon = $derived(icon ? icons[icon] : null);
</script>

{#if Icon}
	<Icon aria-hidden="true" />
{:else if reserve}
	<span aria-hidden="true" class="size-4 shrink-0"></span>
{/if}

<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	interface Props {
		groupName: string;
		isCollapsed?: boolean;
		isPinned?: boolean;
		onToggle?: () => void;
		onPinToggle?: () => void;
	}

	let { groupName, isCollapsed = false, isPinned = false, onToggle, onPinToggle }: Props = $props();
</script>

<div
	class="flex h-full w-full min-w-[calc(var(--calendar-personnel-column-width)+(var(--calendar-cell-width)*var(--dates-count)))] border-b border-chrome-border bg-chrome text-chrome-text"
>
	<div
		class="sticky left-0 z-[4] flex max-w-[calc(var(--calendar-personnel-column-width)*2)] min-w-[var(--calendar-personnel-column-width)] shrink-0 items-stretch border-r border-chrome-border bg-chrome"
	>
		<Button
			variant="cell"
			size="none"
			class="h-full min-w-0 flex-1 justify-start gap-2 px-3 py-2 font-mono text-[11px] font-semibold tracking-widest text-chrome-text uppercase hover:bg-chrome-hover hover:text-chrome-text dark:hover:bg-chrome-hover"
			onclick={onToggle}
		>
			<span class="w-3 shrink-0 text-[10px]">{isCollapsed ? '▶' : '▼'}</span>
			<span class="truncate">{groupName}</span>
		</Button>
		<Button
			variant="cell"
			size="none"
			class="h-full min-w-14.5 border-l border-chrome-border px-2 font-mono text-[11px] font-medium tracking-widest text-chrome-text uppercase opacity-75 hover:bg-chrome-hover hover:text-chrome-text hover:opacity-100 aria-pressed:bg-accent/12 aria-pressed:text-accent aria-pressed:opacity-100 dark:hover:bg-chrome-hover dark:aria-pressed:bg-accent/12"
			onclick={onPinToggle}
			aria-pressed={isPinned}
			title={isPinned ? 'Unpin group' : 'Pin group to top'}
		>
			{isPinned ? 'Pinned' : 'Pin'}
		</Button>
	</div>
</div>

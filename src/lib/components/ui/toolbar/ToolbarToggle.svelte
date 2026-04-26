<script lang="ts">
	import { ListFilter } from '@lucide/svelte';

	interface Props {
		label: string;
		pressed?: boolean;
		title?: string;
		disabled?: boolean;
		onToggle?: (pressed: boolean) => void;
	}

	let { label, pressed = $bindable(false), title = label, disabled = false, onToggle }: Props = $props();

	const resolvedTitle = $derived(title ?? label);

	function toggle(): void {
		if (disabled) return;
		pressed = !pressed;
		onToggle?.(pressed);
	}
</script>

<button
	type="button"
	class="toolbar-toggle btn btn-sm btn-icon"
	class:toolbar-toggle--active={pressed}
	aria-label={label}
	aria-pressed={pressed}
	{disabled}
	title={resolvedTitle}
	data-toggle-active={pressed}
	onclick={toggle}
>
	<ListFilter size={16} strokeWidth={2} aria-hidden="true" />
</button>

<style>
	.toolbar-toggle {
		position: relative;
		color: var(--text-secondary);
	}

	.toolbar-toggle--active {
		border-color: var(--color-chrome-active);
		color: var(--color-chrome-active);
		background: rgba(var(--amber-rgb), 0.1);
	}

	.toolbar-toggle--active::after {
		position: absolute;
		right: 6px;
		top: 6px;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: currentColor;
		content: '';
	}
</style>

<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		/** What the item is, so every button names it: "Move Litters up". */
		name: string;
		first: boolean;
		last: boolean;
		disabled: boolean;
		onMove: (step: -1 | 1) => void;
		onEdit: () => void;
		onRemove: () => void;
	}

	let { name, first, last, disabled, onMove, onEdit, onRemove }: Props = $props();
</script>

<div class="flex items-center gap-0.5">
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label={`Move ${name} up`}
		disabled={disabled || first}
		onclick={() => onMove(-1)}
	>
		<ChevronUp />
	</Button>
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label={`Move ${name} down`}
		disabled={disabled || last}
		onclick={() => onMove(1)}
	>
		<ChevronDown />
	</Button>
	<Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} {disabled} onclick={onEdit}><Pencil /></Button>
	<Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} {disabled} onclick={onRemove}><Trash2 /></Button>
</div>

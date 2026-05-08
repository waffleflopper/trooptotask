<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	let {
		value = $bindable(''),
		placeholder = 'Add a note...',
		addLabel = 'Add',
		disabled = false,
		onAdd
	}: {
		value?: string;
		placeholder?: string;
		addLabel?: string;
		disabled?: boolean;
		onAdd: () => void;
	} = $props();

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && value.trim() && !disabled) {
			onAdd();
		}
	}
</script>

<div data-slot="onboarding-packet-note-input" class="flex gap-2 max-sm:flex-col">
	<Input bind:value {placeholder} {disabled} onkeydown={handleKeydown} aria-label={placeholder} />
	<Button size="sm" disabled={disabled || !value.trim()} onclick={onAdd}>{addLabel}</Button>
</div>

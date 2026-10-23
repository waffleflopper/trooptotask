<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils.js';

	let {
		value,
		label,
		describedBy,
		class: className,
		onCommit
	}: {
		value: string;
		label: string;
		describedBy?: string;
		class?: string;
		onCommit: (value: string) => void;
	} = $props();

	let draft = $derived(value);

	let lastSent = '';

	function commitIfChanged(input: HTMLInputElement) {
		if (input.value === lastSent) return;
		lastSent = input.value;
		onCommit(input.value);
	}

	function keydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitIfChanged(event.currentTarget);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			draft = value;
		}
	}
</script>

<Input
	bind:value={draft}
	aria-label={label}
	aria-invalid="true"
	aria-describedby={describedBy}
	class={cn('h-7 px-2 text-sm', className)}
	onkeydown={keydown}
	onfocus={(event) => (lastSent = event.currentTarget.value)}
	onblur={(event) => commitIfChanged(event.currentTarget)}
/>

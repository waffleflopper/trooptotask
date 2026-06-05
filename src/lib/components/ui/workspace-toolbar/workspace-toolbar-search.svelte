<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import * as InputGroup from '$lib/components/ui/input-group';

	type Props = {
		value: string;
		ariaLabel: string;
		placeholder?: string;
		testId?: string;
		onValueChange?: (value: string) => void;
	};

	let { value = $bindable(''), ariaLabel, placeholder = 'Search...', testId, onValueChange }: Props = $props();

	function handleInput(): void {
		onValueChange?.(value);
	}
</script>

<InputGroup.Root class="w-40 sm:w-56">
	<InputGroup.Addon>
		<Search aria-hidden="true" />
	</InputGroup.Addon>
	<InputGroup.Input
		type="search"
		aria-label={ariaLabel}
		{placeholder}
		data-testid={testId}
		bind:value
		oninput={handleInput}
	/>
</InputGroup.Root>

<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	type Props = {
		checked?: boolean;
		indeterminate?: boolean;
		disabled?: boolean;
		ariaLabel: string;
		onCheckedChange?: (checked: boolean) => void;
	};

	let {
		checked = $bindable(false),
		indeterminate = false,
		disabled = false,
		ariaLabel,
		onCheckedChange
	}: Props = $props();
</script>

<Checkbox
	bind:checked
	{indeterminate}
	{disabled}
	aria-label={ariaLabel}
	onCheckedChange={(value) => onCheckedChange?.(!!value)}
/>

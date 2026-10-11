<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	type Props = {
		checked?: boolean;
		indeterminate?: boolean;
		disabled?: boolean;
		ariaLabel: string;
		/** The row cannot be selected because its data is invalid; `describedBy` names the reason. */
		invalid?: boolean;
		describedBy?: string;
		onCheckedChange?: (checked: boolean) => void;
	};

	let {
		checked = $bindable(false),
		indeterminate = false,
		disabled = false,
		ariaLabel,
		invalid = false,
		describedBy,
		onCheckedChange
	}: Props = $props();
</script>

<Checkbox
	bind:checked
	{indeterminate}
	{disabled}
	aria-label={ariaLabel}
	aria-invalid={invalid || undefined}
	aria-describedby={describedBy}
	onCheckedChange={(value) => onCheckedChange?.(!!value)}
/>

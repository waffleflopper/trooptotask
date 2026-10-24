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
		/** `shiftKey` is true when a Shift-click made the change, so a table can select the range. */
		onCheckedChange?: (checked: boolean, change: { shiftKey: boolean }) => void;
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
	let shiftClick = false;
</script>

<Checkbox
	bind:checked
	{indeterminate}
	{disabled}
	aria-label={ariaLabel}
	aria-invalid={invalid || undefined}
	aria-describedby={describedBy}
	onclick={(event: MouseEvent) => (shiftClick = event.shiftKey)}
	onCheckedChange={(value) => {
		onCheckedChange?.(!!value, { shiftKey: shiftClick });
		shiftClick = false;
	}}
/>

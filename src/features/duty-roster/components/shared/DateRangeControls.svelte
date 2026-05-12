<script lang="ts">
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as PageShell from '$lib/components/ui/page-shell/index.js';

	type Props = {
		startDate: string;
		endDate: string;
		rangeLabel: string;
		startDescription?: string;
		endDescription?: string;
		startInvalid?: boolean;
		endInvalid?: boolean;
		onStartDateChange?: (value: string) => void;
		onEndDateChange?: (value: string) => void;
	};

	let {
		startDate,
		endDate,
		rangeLabel,
		startDescription = 'Start date must be today or later.',
		endDescription = 'End date must be on or after start date.',
		startInvalid = false,
		endInvalid = false,
		onStartDateChange,
		onEndDateChange
	}: Props = $props();
</script>

<div class="grid gap-3">
	<div class="grid gap-3 md:grid-cols-2">
		<Field.Root data-invalid={startInvalid || undefined}>
			<Field.Label>Start Date</Field.Label>
			<DatePicker value={startDate} onValueChange={onStartDateChange} aria-label="Start Date" />
			<Field.Description>{startDescription}</Field.Description>
		</Field.Root>
		<Field.Root data-invalid={endInvalid || undefined}>
			<Field.Label>End Date</Field.Label>
			<DatePicker value={endDate} onValueChange={onEndDateChange} aria-label="End Date" />
			<Field.Description>{endDescription}</Field.Description>
		</Field.Root>
	</div>
	<PageShell.FactRow label="Date Range" value={rangeLabel} />
</div>

<script lang="ts">
	import type { EvalType, ReportType } from '../rating-scheme.types';
	import { getExtendedAnnualWarning, getReportTypesForEvalType } from '../utils/ratingScheme';
	import { withPeriodStart, withReportType, type ReportPeriodDraft } from '../utils/reportPeriodDraft';
	import * as Alert from '$lib/components/ui/alert';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';

	interface Props {
		idPrefix: string;
		draft: ReportPeriodDraft;
		evalType: EvalType;
		disabled?: boolean;
		/** Shown under the fields, such as where the type comes from or why they are locked. */
		hint: string;
		/** A reason the period cannot be saved, once a save was tried. */
		problem?: string | null;
		onChange: (draft: ReportPeriodDraft) => void;
	}

	let { idPrefix, draft, evalType, disabled = false, hint, problem = null, onChange }: Props = $props();

	const options = $derived.by(() => {
		const listed = getReportTypesForEvalType(evalType);
		const kept = draft.reportType && !listed.some((option) => option.value === draft.reportType);
		return kept ? [...listed, { value: draft.reportType as ReportType, label: draft.reportType }] : listed;
	});
	const eaWarning = $derived(
		getExtendedAnnualWarning(draft.reportType || null, evalType, draft.ratingPeriodStart, draft.ratingPeriodEnd)
	);
</script>

<div class="grid gap-3">
	<div class="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]">
		<Field.Root>
			<Field.Label for="{idPrefix}-report">Report</Field.Label>
			<NativeSelect
				id="{idPrefix}-report"
				class="w-full"
				{disabled}
				value={draft.reportType}
				onchange={(event) => onChange(withReportType(draft, event.currentTarget.value as ReportType | ''))}
			>
				<NativeSelectOption value="">Not set</NativeSelectOption>
				{#each options as option (option.value)}
					<NativeSelectOption value={option.value}>{option.value} · {option.label}</NativeSelectOption>
				{/each}
			</NativeSelect>
		</Field.Root>
		<Field.Root>
			<Field.Label for="{idPrefix}-start">Start</Field.Label>
			<DatePicker
				id="{idPrefix}-start"
				class="h-9 w-full"
				{disabled}
				value={draft.ratingPeriodStart}
				placeholder="Select start"
				onValueChange={(value) => onChange(withPeriodStart(draft, value))}
			/>
		</Field.Root>
		<Field.Root>
			<Field.Label for="{idPrefix}-thru">Thru</Field.Label>
			<DatePicker
				id="{idPrefix}-thru"
				class="h-9 w-full"
				{disabled}
				value={draft.ratingPeriodEnd}
				placeholder="Select thru"
				onValueChange={(value) => onChange({ ...draft, ratingPeriodEnd: value })}
			/>
		</Field.Root>
	</div>
	{#if problem}
		<Field.Error>{problem}</Field.Error>
	{/if}
	<p class="text-[13px] leading-[18px] text-muted-foreground">{hint}</p>
	{#if eaWarning && !disabled}
		<Alert.Root variant="warning">
			<Alert.Description>{eaWarning}</Alert.Description>
		</Alert.Root>
	{/if}
</div>

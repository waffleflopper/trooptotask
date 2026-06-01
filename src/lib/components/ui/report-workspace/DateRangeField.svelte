<script module lang="ts">
	export interface DateRangePreset {
		id: string;
		label: string;
		getRange: () => { start: string; end: string };
	}

	export function formatLocalDate(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	function addDays(date: Date, days: number): Date {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
	}

	function startOfWeek(date: Date): Date {
		const day = date.getDay();
		const diff = date.getDate() - day + (day === 0 ? -6 : 1);
		return new Date(date.getFullYear(), date.getMonth(), diff);
	}

	const currentYear = new Date().getFullYear();

	export const YEAR_PRESETS: DateRangePreset[] = Array.from({ length: 5 }, (_, index) => {
		const year = currentYear - index;
		return {
			id: `year-${year}`,
			label: String(year),
			getRange: () => ({ start: `${year}-01-01`, end: `${year}-12-31` })
		};
	});

	export const WEEK_PRESETS: DateRangePreset[] = [
		{
			id: 'this-week',
			label: 'This Week',
			getRange: () => {
				const start = startOfWeek(new Date());
				return { start: formatLocalDate(start), end: formatLocalDate(addDays(start, 6)) };
			}
		},
		{
			id: 'next-week',
			label: 'Next Week',
			getRange: () => {
				const start = addDays(startOfWeek(new Date()), 7);
				return { start: formatLocalDate(start), end: formatLocalDate(addDays(start, 6)) };
			}
		},
		{
			id: 'next-two-weeks',
			label: 'Next 2 Weeks',
			getRange: () => {
				const start = addDays(startOfWeek(new Date()), 7);
				return { start: formatLocalDate(start), end: formatLocalDate(addDays(start, 13)) };
			}
		},
		{
			id: 'this-month',
			label: 'This Month',
			getRange: () => {
				const now = new Date();
				const start = new Date(now.getFullYear(), now.getMonth(), 1);
				const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
				return { start: formatLocalDate(start), end: formatLocalDate(end) };
			}
		}
	];

	export const FORECAST_PRESET: DateRangePreset[] = [
		{
			id: 'next-30-days',
			label: 'Next 30 Days',
			getRange: () => {
				const today = new Date();
				return { start: formatLocalDate(today), end: formatLocalDate(addDays(today, 30)) };
			}
		}
	];
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import * as Field from '$lib/components/ui/field/index.js';

	interface Props {
		start: string;
		end: string;
		presets?: DateRangePreset[];
		onCustom?: () => void;
	}

	let { start = $bindable(), end = $bindable(), presets = [], onCustom }: Props = $props();

	function applyPreset(preset: DateRangePreset) {
		const range = preset.getRange();
		start = range.start;
		end = range.end;
	}

	function handleCustomChange() {
		onCustom?.();
	}
</script>

<div class="grid gap-2">
	<div class="grid min-w-0 gap-2 sm:grid-cols-2">
		<Field.Root>
			<Field.Label>Start</Field.Label>
			<DatePicker bind:value={start} onValueChange={handleCustomChange} placeholder="Select start date" />
		</Field.Root>
		<Field.Root>
			<Field.Label>End</Field.Label>
			<DatePicker bind:value={end} onValueChange={handleCustomChange} placeholder="Select end date" />
		</Field.Root>
	</div>

	{#if presets.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each presets as preset (preset.id)}
				<Button type="button" variant="outline" size="sm" onclick={() => applyPreset(preset)}>
					{preset.label}
				</Button>
			{/each}
		</div>
	{/if}
</div>

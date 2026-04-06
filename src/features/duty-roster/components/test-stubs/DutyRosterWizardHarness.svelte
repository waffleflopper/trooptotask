<script lang="ts">
	import type {
		DutyEvent,
		DutyEventRunDeleteResult,
		DutyEventSeriesApplyResult,
		DutyEventSeriesInput
	} from '../../duty-roster.types';

	interface Props {
		advancedDutyEvents?: DutyEvent[];
		onApplyAdvancedSeries?: (input: DutyEventSeriesInput) => Promise<DutyEventSeriesApplyResult | null>;
		onDeleteAdvancedRun?: (runId: string) => Promise<DutyEventRunDeleteResult | null>;
	}

	let { advancedDutyEvents = [], onApplyAdvancedSeries, onDeleteAdvancedRun }: Props = $props();

	async function applySeries() {
		await onApplyAdvancedSeries?.({
			templateId: 'tmpl-staff-duty',
			startDate: '2026-04-10',
			endDate: '2026-04-10',
			pattern: 'daily'
		});
	}

	async function deleteRun() {
		await onDeleteAdvancedRun?.('run-1');
	}
</script>

<div data-testid="advanced-event-count">{advancedDutyEvents.length}</div>
<button type="button" onclick={applySeries}>Apply Advanced Series</button>
<button type="button" onclick={deleteRun}>Delete Advanced Run</button>

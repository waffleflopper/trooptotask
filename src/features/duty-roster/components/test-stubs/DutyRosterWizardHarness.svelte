<script lang="ts">
	import type {
		DutyEvent,
		AdvancedDutyRunSnapshotRecord,
		DutyEventRunDeleteResult,
		DutyEventSeriesApplyResult,
		DutyEventSeriesInput
	} from '../../duty-roster.types';

	interface Props {
		advancedDutyEvents?: DutyEvent[];
		initialView?: string;
		resumeSnapshot?: AdvancedDutyRunSnapshotRecord | null;
		onApplyAdvancedSeries?: (input: DutyEventSeriesInput) => Promise<DutyEventSeriesApplyResult | null>;
		onDeleteAdvancedRun?: (runId: string) => Promise<DutyEventRunDeleteResult | null>;
	}

	let {
		advancedDutyEvents = [],
		initialView = 'choose-lane',
		resumeSnapshot = null,
		onApplyAdvancedSeries,
		onDeleteAdvancedRun
	}: Props = $props();

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
<div data-testid="wizard-initial-view">{initialView}</div>
<div data-testid="wizard-resume-snapshot">{resumeSnapshot?.id ?? ''}</div>
<button type="button" onclick={applySeries}>Apply Advanced Series</button>
<button type="button" onclick={deleteRun}>Delete Advanced Run</button>

<script lang="ts">
	import AppliedEventLedger from './AppliedEventLedger.svelte';
	import type { DutyEvent } from '../duty-roster.types';
	import type { AppliedEventRunGroup } from './dutyRosterWizard.helpers';
	interface Props {
		groups: AppliedEventRunGroup[];
		selectedEventId: string | null;
		formatDisplayDate: (date: string) => string;
		formatGroupRange: (group: Pick<AppliedEventRunGroup, 'startDate' | 'endDate'>) => string;
		formatCoverageLabel: (event: {
			coverageMode: 'all-day' | 'timed';
			coverageStart: string;
			coverageEnd: string;
		}) => string;
		formatFillSummary: (event: DutyEvent) => string;
		formatSlotAssignee: (id: string | null) => string;
		onOpenEvent: (event: DutyEvent) => void;
		onViewRunDa6: (group: AppliedEventRunGroup) => void;
		onRequestDeleteEvent: (event: DutyEvent) => void;
		onRequestDeleteRun: (group: AppliedEventRunGroup) => void;
	}
	let props: Props = $props();
</script>

<section class="applied-events card card-flat">
	<div class="list-header">
		<div>
			<p class="eyebrow">Applied events</p>
			<h3>Applied advanced duty events</h3>
		</div>
	</div>
	<AppliedEventLedger
		groups={props.groups}
		formatDisplayDate={props.formatDisplayDate}
		formatGroupRange={props.formatGroupRange}
		formatCoverageLabel={props.formatCoverageLabel}
		formatFillSummary={props.formatFillSummary}
		formatSlotAssignee={props.formatSlotAssignee}
		onOpenEvent={props.onOpenEvent}
		onViewRunDa6={props.onViewRunDa6}
		onRequestDeleteEvent={props.onRequestDeleteEvent}
		onRequestDeleteRun={props.onRequestDeleteRun}
		selectedEventId={props.selectedEventId}
	/>
</section>

<style>
	.applied-events {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.list-header {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-4);
	}
	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	h3 {
		margin: 0;
	}
</style>

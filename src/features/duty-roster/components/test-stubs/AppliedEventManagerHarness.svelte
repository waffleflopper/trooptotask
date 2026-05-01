<script lang="ts">
	import type { DutyEvent, DutyEventRunDeleteResult } from '../../duty-roster.types';

	interface Props {
		advancedDutyEvents?: DutyEvent[];
		onDeleteAdvancedRun?: (runId: string) => Promise<DutyEventRunDeleteResult | null>;
	}

	let { advancedDutyEvents = [], onDeleteAdvancedRun }: Props = $props();

	async function deleteRun() {
		await onDeleteAdvancedRun?.('run-1');
	}
</script>

<div data-testid="applied-event-manager">
	<div data-testid="applied-event-count">{advancedDutyEvents.length}</div>
	<button type="button" onclick={deleteRun}>Delete Advanced Run</button>
</div>

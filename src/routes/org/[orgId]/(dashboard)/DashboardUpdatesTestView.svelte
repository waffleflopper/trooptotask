<script lang="ts">
	import type { DashboardPageUpdates, DashboardScreenModel } from '$features/dashboard';
	let { ctx, updates }: { ctx: DashboardScreenModel | null; updates: DashboardPageUpdates } = $props();
</script>

<button type="button" onclick={() => updates.refreshSummary()}>Refresh summary</button>
<button type="button" onclick={() => updates.retryTaskings()}>Retry Taskings</button>
<output aria-label="Current people">{ctx?.data.trainingSummary?.stats?.current ?? 'pending'}</output>
<button
	type="button"
	onclick={() =>
		updates.putRecord('org-1', { list: 'trainingCompletions', trainingTypeId: 'cpr', personnelIds: ['okafor'] })}
>
	Record class
</button>
<output aria-label="Expired people">
	{ctx?.data.trainingSummary?.expiredByType.flatMap((expired) => expired.personnelIds).join(',') ?? 'pending'}
</output>

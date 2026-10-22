<script lang="ts">
	import type { DashboardPageUpdates, DashboardScreenModel } from '$features/dashboard';
	let { ctx, updates }: { ctx: DashboardScreenModel | null; updates: DashboardPageUpdates } = $props();
</script>

<button type="button" onclick={() => updates.refreshSummary()}>Refresh summary</button>
<output aria-label="Current people">{ctx?.data.trainingSummary?.stats?.current ?? 'pending'}</output>

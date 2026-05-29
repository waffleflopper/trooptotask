<script lang="ts">
	import type { PageProps } from './$types';
	import SettingsActivityRail from '../SettingsActivityRail.svelte';

	let { data }: PageProps = $props();

	const activity = $derived(data.approvalsSettings.sections.approvals.activity);
</script>

<div class="grid gap-4">
	<SettingsActivityRail orgId={data.orgUrlSegment} {activity} lockedTab="approvals" />
</div>

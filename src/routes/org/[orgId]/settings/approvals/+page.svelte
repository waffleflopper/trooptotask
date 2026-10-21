<script lang="ts">
	import { SettingsPageHeader } from '$features/organization';
	import type { PageProps } from './$types';
	import PendingApprovals from '../PendingApprovals.svelte';

	let { data }: PageProps = $props();
</script>

<SettingsPageHeader
	page="approvals"
	subtitle="Deletions and archives that need a second set of eyes. Nothing changes until an owner or admin approves it here, and the requester sees your answer."
/>

{#key data.orgId}
	<PendingApprovals orgId={data.orgUrlSegment} requests={data.pendingRequests} />
{/key}

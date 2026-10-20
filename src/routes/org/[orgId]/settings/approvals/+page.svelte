<script lang="ts">
	import { SettingsPageHeader } from '$features/organization';
	import type { PageProps } from './$types';
	import ApprovalRequestsSection from '../ApprovalRequestsSection.svelte';

	let { data }: PageProps = $props();

	const activity = $derived(data.approvalsSettings.sections.approvals.activity);
</script>

<SettingsPageHeader
	page="approvals"
	subtitle="Deletions and archives that need a second set of eyes. Nothing changes until an owner or admin approves it here, and the requester sees your answer."
/>

{#key data.orgId}
	<ApprovalRequestsSection orgId={data.orgUrlSegment} approvalRequests={activity.approvalRequests} />
{/key}

<script lang="ts">
	import type { PageProps } from './$types';
	import ApprovalRequestsSection from '../ApprovalRequestsSection.svelte';

	let { data }: PageProps = $props();

	const activity = $derived(data.approvalsSettings.sections.approvals.activity);
</script>

{#key data.orgId}
	<ApprovalRequestsSection orgId={data.orgUrlSegment} approvalRequests={activity.approvalRequests} />
{/key}

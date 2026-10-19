<script lang="ts">
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import { PersonnelRecordHeader } from '$features/personnel';
	import type { PersonnelDetailHeader, PersonnelDetailLayoutStreams } from '$features/personnel/contracts';
	import { requestPersonnelArchiveApproval } from '$lib/personnelArchiveRequestDelivery';

	interface LayoutData {
		personnelDetailHeader: PersonnelDetailHeader;
		personnelDetailLayout: PersonnelDetailLayoutStreams;
		today: string;
	}

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	const org = getAppShellContext();
	const activeTab = $derived(page.route.id?.replace('/org/[orgId]/personnel/[personnelSlug]', '') ?? '');
</script>

<section class="flex min-h-full flex-col bg-background text-foreground">
	{#key data.personnelDetailHeader.person.id}
		<PersonnelRecordHeader
			orgId={org.orgId}
			orgUrlSegment={org.orgUrlSegment}
			header={data.personnelDetailHeader}
			streams={data.personnelDetailLayout}
			today={data.today}
			{activeTab}
			access={org}
			requestArchiveApproval={requestPersonnelArchiveApproval}
		/>
	{/key}

	{@render children()}
</section>

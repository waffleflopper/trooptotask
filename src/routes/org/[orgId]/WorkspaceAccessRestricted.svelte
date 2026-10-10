<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';

	let { subject = 'this area' }: { subject?: string } = $props();
</script>

<svelte:head>
	<title>Access Restricted - Troop to Task</title>
</svelte:head>

<Empty.Root role="alert" class="m-4 w-auto min-h-80 border bg-card p-6 text-card-foreground sm:m-6 sm:p-8">
	<Empty.Header>
		<h1 class="text-xl font-semibold tracking-tight">Access Restricted</h1>
		<Empty.Description>
			You don't have permission to view {subject}. Contact your organization admin for access.
		</Empty.Description>
	</Empty.Header>
</Empty.Root>

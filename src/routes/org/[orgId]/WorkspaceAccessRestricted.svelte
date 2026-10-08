<script lang="ts">
	let { subject = 'this area' }: { subject?: string } = $props();
</script>

<section role="alert" class="m-4 min-h-80 rounded-lg border bg-card p-6 text-card-foreground sm:m-6 sm:p-8">
	<h1 class="text-xl font-semibold">Access Restricted</h1>
	<p>You don't have permission to view {subject}. Contact your organization admin for access.</p>
</section>

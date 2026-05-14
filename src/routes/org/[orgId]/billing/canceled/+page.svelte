<script lang="ts">
	import { CircleX } from '@lucide/svelte';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as PageShell from '$lib/components/ui/page-shell';

	const orgId = $derived($page.params.orgId);
</script>

<svelte:head>
	<title>Subscription Canceled - Troop to Task</title>
</svelte:head>

<PageShell.Root width="content" class="flex items-center justify-center">
	<Card.Root class="w-full max-w-xl">
		<Card.Header>
			<div class="flex items-center gap-3">
				<CircleX class="size-8 text-muted-foreground" />
				<div class="grid gap-1">
					<Card.Description>Billing Update</Card.Description>
					<Card.Title>Subscription Setup Canceled</Card.Title>
				</div>
			</div>
		</Card.Header>
		<Card.Content>
			<p class="text-sm text-muted-foreground">
				No charges were made. You can return to billing and try again whenever you are ready.
			</p>
		</Card.Content>
		<Card.Footer class="flex flex-col gap-2 sm:flex-row">
			<Button href="/org/{orgId}/billing" class="w-full sm:w-auto">Back to Billing</Button>
			<Button href="/org/{orgId}" variant="outline" class="w-full sm:w-auto">Go to Dashboard</Button>
		</Card.Footer>
	</Card.Root>
</PageShell.Root>

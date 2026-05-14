<script lang="ts">
	import { CheckCircle2 } from '@lucide/svelte';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as PageShell from '$lib/components/ui/page-shell';

	const orgId = $derived($page.params.orgId);
</script>

<svelte:head>
	<title>Subscription Active - Troop to Task</title>
</svelte:head>

<PageShell.Root width="content" class="flex items-center justify-center">
	<Card.Root class="w-full max-w-xl">
		<Card.Header>
			<div class="flex items-center gap-3">
				<CheckCircle2 class="size-8 text-success-foreground" />
				<div class="grid gap-1">
					<Card.Description>Billing Update</Card.Description>
					<Card.Title>Subscription Active</Card.Title>
				</div>
			</div>
		</Card.Header>
		<Card.Content>
			<p class="text-sm text-muted-foreground">
				Your plan has been updated. Your organization now has access to the new tier's features and personnel limits.
			</p>
		</Card.Content>
		<Card.Footer class="flex flex-col gap-2 sm:flex-row">
			<Button href="/org/{orgId}" class="w-full sm:w-auto">Go to Dashboard</Button>
			<Button href="/org/{orgId}/billing" variant="outline" class="w-full sm:w-auto">View Billing</Button>
		</Card.Footer>
	</Card.Root>
</PageShell.Root>

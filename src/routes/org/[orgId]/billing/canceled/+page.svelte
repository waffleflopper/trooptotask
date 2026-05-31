<script lang="ts">
	import { CircleX } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as PageShell from '$lib/components/ui/page-shell';

	let { data }: PageProps = $props();

	const orgUrlSegment = $derived(data.shell.org.urlSegment);
	const billingHref = $derived(`/org/${orgUrlSegment}/billing`);
	const dashboardHref = $derived(`/org/${orgUrlSegment}`);
</script>

<svelte:head>
	<title>Checkout Not Completed - Troop to Task</title>
</svelte:head>

<PageShell.Root width="content" class="flex items-center justify-center">
	<Card.Root class="w-full max-w-xl">
		<Card.Header>
			<div class="flex items-center gap-3">
				<CircleX class="size-8 text-muted-foreground" />
				<div class="grid gap-1">
					<Card.Description>Billing Update</Card.Description>
					<Card.Title>Checkout Not Completed</Card.Title>
				</div>
			</div>
		</Card.Header>
		<Card.Content class="grid gap-2">
			<p class="text-sm text-muted-foreground">
				No payment was completed from this checkout. Your current plan was not canceled or changed.
			</p>
			<p class="text-sm text-muted-foreground">
				Return to Billing when you are ready to choose a plan or review your current subscription.
			</p>
		</Card.Content>
		<Card.Footer class="flex flex-col gap-2 sm:flex-row">
			<Button href={billingHref} class="w-full sm:w-auto">Back to Billing</Button>
			<Button href={dashboardHref} variant="outline" class="w-full sm:w-auto">Go to Dashboard</Button>
		</Card.Footer>
	</Card.Root>
</PageShell.Root>

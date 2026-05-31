<script lang="ts">
	import { AlertCircle, CheckCircle2, Clock3, RefreshCw } from '@lucide/svelte';
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
	<title>{data.checkoutStatus.title} - Troop to Task</title>
</svelte:head>

<PageShell.Root width="content" class="flex items-center justify-center">
	<Card.Root class="w-full max-w-xl">
		<Card.Header>
			<div class="flex items-center gap-3">
				{#if data.checkoutStatus.state === 'active'}
					<CheckCircle2 class="size-8 text-success-foreground" />
				{:else if data.checkoutStatus.state === 'payment_incomplete'}
					<AlertCircle class="size-8 text-destructive" />
				{:else if data.checkoutStatus.state === 'pending'}
					<Clock3 class="size-8 text-primary" />
				{:else}
					<RefreshCw class="size-8 text-muted-foreground" />
				{/if}
				<div class="grid gap-1">
					<Card.Description>{data.checkoutStatus.eyebrow}</Card.Description>
					<Card.Title>{data.checkoutStatus.title}</Card.Title>
				</div>
			</div>
		</Card.Header>
		<Card.Content class="grid gap-2">
			<p class="text-sm text-muted-foreground">{data.checkoutStatus.description}</p>
			<p class="text-sm text-muted-foreground">{data.checkoutStatus.detail}</p>
		</Card.Content>
		<Card.Footer class="flex flex-col gap-2 sm:flex-row">
			<Button href={billingHref} class="w-full sm:w-auto">View Billing</Button>
			<Button href={dashboardHref} variant="outline" class="w-full sm:w-auto">Go to Dashboard</Button>
		</Card.Footer>
	</Card.Root>
</PageShell.Root>

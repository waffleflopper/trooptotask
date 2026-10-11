<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	// Server-side guard ensures only suspended users see this
</script>

<svelte:head>
	<title>Account Suspended - Troop to Task</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
	<Card.Root class="w-full max-w-[480px]">
		<Card.Header>
			<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-accent uppercase">Access Restricted</p>
			<h1 class="font-heading text-4xl leading-none font-extrabold text-destructive uppercase sm:text-5xl">
				Account Suspended
			</h1>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<p class="text-sm leading-relaxed text-muted-foreground">
				This account is currently suspended. If you believe that is incorrect, contact support so we can review it.
			</p>
			<div class="flex flex-col gap-2 rounded-md border bg-muted/70 p-4">
				<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-accent uppercase">Support</p>
				<p class="text-base font-semibold text-foreground">support@trooptotask.org</p>
			</div>
			<form method="POST" action={resolve('/auth/logout')}>
				<Button type="submit" variant="outline">Sign out</Button>
			</form>
		</Card.Content>
	</Card.Root>
</main>

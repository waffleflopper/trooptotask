<script lang="ts">
	import { CheckCircle2, Circle } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Progress } from '$lib/components/ui/progress';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';

	interface Props {
		ctx: DashboardScreenModel;
	}

	let { ctx }: Props = $props();

	const items = $derived(ctx.gettingStartedItems);
	const completedCount = $derived(items.filter((item) => item.complete).length);
	const progress = $derived(items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0);

	function dismiss() {
		void ctx.dismissGettingStarted();
	}
</script>

<Card.Root class="border-primary/20 bg-card">
	<Card.Header class="gap-3">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<div class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Workspace setup
				</div>
				<Card.Title class="mt-1">Get this Organization ready</Card.Title>
			</div>
			<div class="flex items-center gap-2">
				<Badge variant={completedCount === items.length ? 'success' : 'secondary'}>
					{completedCount}/{items.length} complete
				</Badge>
				<Button variant="ghost" size="sm" onclick={dismiss}>Dismiss</Button>
			</div>
		</div>
		<Progress value={progress} aria-label="Workspace setup progress" />
	</Card.Header>
	<Card.Content>
		<ul class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
			{#each items as item (item.id)}
				<li class="rounded-sm border bg-background/60 p-3">
					<div class="flex items-start gap-3">
						{#if item.complete}
							<CheckCircle2 class="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden="true" />
						{:else}
							<Circle class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium text-foreground">{item.label}</span>
								{#if item.complete}
									<Badge variant="success">Done</Badge>
								{/if}
							</div>
							<p class="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
							{#if !item.complete}
								<Button class="mt-3" href={item.href} variant="outline" size="xs" aria-label={`Open ${item.label}`}>
									Open
								</Button>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>

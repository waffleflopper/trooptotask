<script lang="ts">
	import { CheckCircle2, Circle, ExternalLink, LoaderCircle, Sparkles } from '@lucide/svelte';
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
	const starterPack = $derived(ctx.firstStarterConfigurationPack);
	const applyState = $derived(ctx.starterPackApplyState);
	const applyingStarterPack = $derived(applyState.status === 'pending');

	function dismiss() {
		void ctx.dismissGettingStarted();
	}

	function applyStarterPack() {
		if (!starterPack || applyingStarterPack) return;
		void ctx.applyStarterConfigurationPack(starterPack.id);
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
		{#if starterPack}
			<div class="mb-4 rounded-sm border border-dashed bg-background/60 p-3">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="flex items-center gap-2 text-sm font-semibold text-foreground">
							<Sparkles class="size-4 text-primary" aria-hidden="true" />
							<span>{starterPack.name}</span>
							<Badge variant={starterPack.isFullyApplied ? 'success' : 'secondary'}>
								{starterPack.isFullyApplied ? 'Applied' : 'Optional'}
							</Badge>
						</div>
						<p class="mt-1 text-xs leading-relaxed text-muted-foreground">{starterPack.description}</p>
						<p class="mt-1 text-xs leading-relaxed text-muted-foreground">{starterPack.editableCopy}</p>
					</div>
					{#if starterPack.canApply && !starterPack.isFullyApplied}
						<Button type="button" size="sm" onclick={applyStarterPack} disabled={applyingStarterPack}>
							{#if applyingStarterPack}
								<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
								Applying
							{:else}
								<Sparkles class="size-4" aria-hidden="true" />
								Apply Pack
							{/if}
						</Button>
					{:else if !starterPack.canApply}
						<Badge variant="secondary">Configure access needed</Badge>
					{/if}
				</div>
				<ul class="mt-3 grid gap-2 md:grid-cols-3">
					{#each starterPack.artifacts as artifact (artifact.family)}
						<li class="rounded-sm bg-muted/40 p-2">
							<div class="text-xs font-medium text-foreground">{artifact.label}</div>
							<div class="mt-1 truncate text-xs text-muted-foreground" title={artifact.names.join(', ')}>
								{artifact.names.join(', ')}
							</div>
						</li>
					{/each}
				</ul>
				{#if applyState.status === 'success' && applyState.message}
					<p class="mt-3 text-xs font-medium text-success-foreground" role="status" aria-live="polite">
						{applyState.message}
					</p>
				{:else if applyState.status === 'error' && applyState.message}
					<p class="mt-3 text-xs font-medium text-destructive" role="alert">{applyState.message}</p>
				{/if}
			</div>
		{/if}
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
									<ExternalLink class="size-3.5" aria-hidden="true" />
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

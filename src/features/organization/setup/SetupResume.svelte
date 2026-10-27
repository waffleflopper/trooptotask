<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidate } from '$app/navigation';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { Progress } from '$lib/components/ui/progress';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { SetupEntryData } from './entry';
	import type { SetupModel } from './model';
	import { fetchSetupProgress, postSetupPromptChoice, setupErrorMessage } from './setupClient';
	import { SETUP_GROUP_LABELS } from './setupFlow.svelte';

	interface Props {
		orgId: string;
		orgUrlSegment: string;
		entry: Promise<SetupEntryData | null>;
	}

	let { orgId, orgUrlSegment, entry }: Props = $props();

	/** The last settled decision stays while a reload streams, so the button does not blink. */
	let resolved = $state<SetupEntryData | null>(null);
	let open = $state(false);
	let progress = $state<
		{ status: 'loading' } | { status: 'ready'; model: SetupModel } | { status: 'error'; message: string }
	>({ status: 'loading' });
	let pending = $state(false);
	let error = $state<string | null>(null);
	let request = 0;
	onDestroy(() => request++);

	$effect(() => {
		const pendingEntry = entry;
		let live = true;
		pendingEntry.then(
			(data) => live && (resolved = data?.orgId === orgId ? data : null),
			() => live && (resolved = null)
		);
		return () => {
			live = false;
		};
	});

	const neverAsked = $derived(
		resolved !== null && resolved.state.prompts.setup !== undefined && 'never' in resolved.state.prompts.setup
	);

	async function load() {
		const mine = ++request;
		progress = { status: 'loading' };
		error = null;
		pending = false;
		try {
			const model = await fetchSetupProgress(orgUrlSegment);
			if (mine === request) progress = { status: 'ready', model };
		} catch (cause) {
			if (mine === request) progress = { status: 'error', message: setupErrorMessage(cause) };
		}
	}

	function onOpenChange(next: boolean) {
		if (next) void load();
		else request++;
	}

	async function neverAskAgain() {
		if (pending) return;
		const mine = request;
		pending = true;
		error = null;
		try {
			await postSetupPromptChoice(orgUrlSegment, 'setup', 'never');
		} catch (cause) {
			if (mine === request) {
				error = setupErrorMessage(cause);
				pending = false;
			}
			return;
		}
		if (mine !== request) return;
		pending = false;
		open = false;
		request++;
		await invalidate('app:organization-setup');
	}
</script>

{#if resolved && resolved.entry.resume !== null}
	<Popover.Root bind:open {onOpenChange}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm" aria-label="Resume setup" data-setup-resume>
					<CircleDashed class="text-accent-text" aria-hidden="true" />
					<span class="hidden sm:inline">Resume setup</span>
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content
			align="end"
			class="w-[380px] max-w-(--bits-popover-content-available-width) gap-3.5 p-5"
			aria-busy={pending || undefined}
		>
			<div class="grid gap-2">
				<p class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
					Organization setup
				</p>
				{#if progress.status === 'ready'}
					{@const { reviewed, total, unanswered } = progress.model}
					<p class="flex items-baseline gap-2">
						<span class="font-heading text-[28px] leading-7 font-extrabold" data-setup-reviewed
							>{reviewed} of {total}</span
						>
						<span class="text-muted-foreground">reviewed</span>
					</p>
					<Progress value={reviewed} max={total} aria-label="Setup progress" />
					{#if progress.model.steps.some((step) => step.loadErrors.length)}
						<p class="text-[13px] leading-[18px] text-muted-foreground">
							Some of your unit’s data didn’t load, so more steps may already be done.
						</p>
					{/if}
					{#if unanswered.length}
						<ul class="grid border-t border-border pt-1.5">
							{#each unanswered as step (step.key)}
								<li class="flex h-8 items-center gap-2.5">
									<span
										class="size-2 shrink-0 rounded-full border-[1.5px] border-muted-foreground/50"
										aria-hidden="true"
									></span>
									<span class="min-w-0 flex-1 truncate">{step.title}</span>
									<span class="shrink-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
										{SETUP_GROUP_LABELS[step.group]}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				{:else if progress.status === 'loading'}
					<Skeleton class="h-7 w-28" />
					<Skeleton class="h-1 w-full" />
					<div class="grid gap-2 border-t border-border pt-3" aria-hidden="true">
						<Skeleton class="h-4 w-3/4" />
						<Skeleton class="h-4 w-2/3" />
						<Skeleton class="h-4 w-1/2" />
					</div>
				{:else}
					<Alert.Root variant="destructive" role="alert">
						<Alert.Description>Couldn’t load setup progress. {progress.message}</Alert.Description>
					</Alert.Root>
				{/if}
			</div>
			{#if error}
				<Alert.Root variant="destructive" role="alert">
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}
			<div class="flex flex-wrap items-center gap-2.5 pt-1">
				{#if progress.status === 'ready'}
					{@const next = progress.model.unanswered[0]}
					<Button
						href={`/org/${orgUrlSegment}/setup/${progress.model.firstUnansweredSlug}`}
						disabled={pending}
						onclick={() => (open = false)}
						data-setup-continue
					>
						{next ? `Continue with ${next.title}` : 'Review and finish'}
					</Button>
				{:else if progress.status === 'error'}
					<Button variant="outline" onclick={load}>Try again</Button>
				{/if}
				{#if !neverAsked}
					<Button variant="ghost" class="ml-auto" disabled={pending} onclick={neverAskAgain}>Never ask again</Button>
				{/if}
			</div>
		</Popover.Content>
	</Popover.Root>
{/if}

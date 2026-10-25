<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
	import EventTimeline from '$features/platform-admin/components/people/EventTimeline.svelte';
	import PersonRegion from '$features/platform-admin/components/people/PersonRegion.svelte';
	import SetupEmailCommands from '$features/platform-admin/components/people/SetupEmailCommands.svelte';
	import { formatDate } from '$features/platform-admin/peopleFormat';
	import { requestEntries, setupTimelineEntries, sortByTime } from '$features/platform-admin/setupTimeline';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const retry = () => void invalidateAll();
	const request = $derived(data.request);

	// Rescinding ends this page, so it leaves instead of reading a request that no longer waits.
	function afterCommand(succeeded: boolean, action: string | null) {
		if (succeeded && action !== 'rescindAccess') void invalidateAll();
	}
	function afterRescind() {
		void goto(resolve('/admin/people?filter=notSetUp' as '/admin/people'));
	}
</script>

<div class="grid gap-6 px-4 pt-5 pb-10 sm:px-10 sm:pt-9">
	<div class="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
		<div class="min-w-0 flex-1 basis-[34rem]">
			<AdminPageHeader
				eyebrow="Person · Not set up · Closed beta"
				title={request.name}
				description={request.reviewed_at
					? `Approved ${formatDate(request.reviewed_at)}. Has not finished setting up an account.`
					: 'Has not finished setting up an account.'}
			/>
		</div>
		<div class="w-full min-w-0 sm:w-auto sm:max-w-md">
			<SetupEmailCommands name={request.name} primary="resend" onSettled={afterCommand} onRescinded={afterRescind} />
		</div>
	</div>

	<div class="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
		<div class="grid min-w-0 gap-9">
			<section aria-labelledby="request-heading" class="grid gap-3">
				<h2 id="request-heading" class="font-heading text-xl leading-none font-bold">Access request</h2>
				<div class="rounded-xl border border-border bg-card p-5">
					<p class="mb-2 font-mono text-[11px] leading-5 tracking-[0.08em] text-muted-foreground uppercase">
						What they wrote
					</p>
					{#if request.reason}
						<blockquote class="text-[17px] leading-[27px] break-words whitespace-pre-wrap italic">
							“{request.reason}”
						</blockquote>
					{:else}
						<p class="text-sm text-muted-foreground">They did not write anything.</p>
					{/if}
					{#if request.heard_about}
						<p class="mt-3 text-sm text-muted-foreground">
							Found us through: {request.heard_about}{request.heard_about_details
								? ` (${request.heard_about_details})`
								: ''}
						</p>
					{/if}
				</div>
			</section>

			<section aria-labelledby="setup-heading" class="grid gap-3">
				<h2 id="setup-heading" class="font-heading text-xl leading-none font-bold">Setup</h2>
				<PersonRegion region={data.setupTimeline} label="Setup history" onRetry={retry}>
					{#snippet skeleton()}
						<div class="border-t border-foreground">
							{#each [0, 1, 2, 3] as row (row)}
								<div class="border-b border-border py-3"><Skeleton class="h-5 w-3/5" /></div>
							{/each}
						</div>
					{/snippet}
					{#snippet children(timeline)}
						<EventTimeline
							entries={sortByTime([
								...requestEntries(request),
								...setupTimelineEntries(timeline, new Date(), request.email)
							])}
							label="Setup history"
						/>
					{/snippet}
				</PersonRegion>
			</section>
		</div>

		<aside aria-labelledby="request-account" class="grid gap-5">
			<div class="rounded-xl border border-border bg-card p-5">
				<h2 id="request-account" class="mb-2 font-heading text-xl leading-none font-bold">Account</h2>
				<dl>
					<div class="grid gap-0.5 border-b border-border py-2.5">
						<dt class="font-mono text-[11px] leading-5 tracking-[0.08em] text-muted-foreground uppercase">Email</dt>
						<dd class="text-sm leading-5 wrap-anywhere">{request.email}</dd>
					</div>
					<div class="grid gap-0.5 border-b border-border py-2.5">
						<dt class="font-mono text-[11px] leading-5 tracking-[0.08em] text-muted-foreground uppercase">Approved</dt>
						<dd class="text-sm leading-5">{request.reviewed_at ? formatDate(request.reviewed_at) : 'Not recorded'}</dd>
					</div>
					<div class="grid gap-0.5 border-b border-border py-2.5">
						<dt class="font-mono text-[11px] leading-5 tracking-[0.08em] text-muted-foreground uppercase">
							Link expires
						</dt>
						<dd class="text-sm leading-5">
							<PersonRegion region={data.setupTimeline} label="Setup history" onRetry={retry}>
								{#snippet skeleton()}<Skeleton class="h-5 w-28" />{/snippet}
								{#snippet children(timeline)}
									{@const live = timeline.find((link) => !link.revoked_at && !link.used_at)}
									{live ? formatDate(live.expires_at) : 'No live link'}
								{/snippet}
							</PersonRegion>
						</dd>
					</div>
					<div class="grid gap-0.5 py-2.5">
						<dt class="font-mono text-[11px] leading-5 tracking-[0.08em] text-muted-foreground uppercase">
							Organizations
						</dt>
						<dd class="text-sm leading-5 text-muted-foreground">None yet</dd>
					</div>
				</dl>
			</div>
			<div class="rounded-xl border border-dashed border-border p-5">
				<div class="mb-2 flex items-center justify-between gap-3">
					<h2 class="font-heading text-xl leading-none font-bold">Closed beta</h2>
					<Badge variant="warning" class="font-mono text-[11px] tracking-[0.08em] uppercase">Temporary</Badge>
				</div>
				<p class="text-sm leading-[21px] text-muted-foreground">
					Manual approval exists only while sign-up is invite-only. When registration opens, this page state and the
					access request Inbox item are deleted together.
				</p>
			</div>
		</aside>
	</div>
</div>

<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CheckIcon from '@lucide/svelte/icons/check';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { DeletionRequestApproval } from '$features/deletion-requests/contracts';
	import { approvalKind, requestedAgo, waitingSummary } from './approvalRequests';

	let { orgId, requests }: { orgId: string; requests: DeletionRequestApproval[] } = $props();

	const now = new Date();
	let denyingId = $state<string | null>(null);
	let denialReason = $state('');
	let processingApproval = $state<string | null>(null);
	let reviewError = $state<{ id: string; message: string } | null>(null);
	let heading = $state<HTMLHeadingElement | null>(null);
	const reviewedIds = new SvelteSet<string>();
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const reviewing = $derived(processingApproval !== null);
	const pending = $derived(requests.filter((request) => !reviewedIds.has(request.id)));
	const summary = $derived(
		waitingSummary(
			pending.map((request) => request.created_at),
			now
		)
	);

	function requestName(request: DeletionRequestApproval) {
		return request.resource_description ?? approvalKind(request.resource_type).label;
	}

	async function focusById(id: string) {
		await tick();
		document.getElementById(id)?.focus();
	}

	function startDenial(id: string) {
		if (processingApproval) return;
		denyingId = id;
		denialReason = '';
		void focusById(`denial-reason-${id}`);
	}

	function cancelDenial(id: string) {
		denyingId = null;
		denialReason = '';
		void focusById(`deny-${id}`);
	}

	async function review(id: string, action: 'approve' | 'deny', reason?: string) {
		if (!active || processingApproval || reviewedIds.has(id)) return;
		processingApproval = id;
		reviewError = null;
		const failureMessage = 'Unable to confirm the review. Refresh the page or try again.';
		try {
			const res = await fetch(`/org/${orgId}/api/deletion-requests/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, action, denialReason: reason ?? null })
			});
			if (!active) return;
			if (!res.ok) {
				const err: unknown = await res.json().catch(() => null);
				if (!active) return;
				const message =
					err !== null && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
						? err.message.trim()
						: '';
				reviewError = { id, message: message || failureMessage };
				return;
			}
			const body: unknown = await res.json().catch(() => null);
			if (!active) return;
			// HTTP acknowledgment is separate from refreshing the current read model.
			reviewedIds.add(id);
			if (body && typeof body === 'object' && 'fileCleanup' in body && body.fileCleanup === 'pending')
				toastStore.info('Approved. The stored file will be removed automatically.');
			if (denyingId === id) {
				denyingId = null;
				denialReason = '';
			}
			await tick();
			heading?.focus();
			try {
				await invalidateAll();
			} catch {
				if (active) toastStore.warning('Review completed. Refresh the page to update the list.');
			}
		} catch {
			if (active) reviewError = { id, message: failureMessage };
		} finally {
			if (active) processingApproval = null;
		}
	}
</script>

<section class="border-t-2 border-foreground" aria-labelledby="pending-approvals-heading">
	<h2 bind:this={heading} id="pending-approvals-heading" tabindex="-1" class="sr-only">Pending requests</h2>
	{#if summary}
		<div class="flex items-center gap-4 border-b py-3 font-mono text-xs leading-5">
			<p class="flex-1 font-semibold text-warning-foreground">{summary}</p>
			<p class="text-muted-foreground">Newest first</p>
		</div>
	{/if}
	<ul>
		{#each pending as request (request.id)}
			{@const kind = approvalKind(request.resource_type)}
			{@const name = requestName(request)}
			{@const busy = processingApproval === request.id}
			<li class="grid gap-3 border-b py-4.5">
				<div class="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
					<p
						class="font-mono text-[11px] leading-5 font-medium tracking-[0.08em] text-muted-foreground uppercase md:w-30 md:shrink-0"
					>
						{kind.label}
					</p>
					<div class="grid min-w-0 flex-1 gap-0.5">
						{#if request.resource_url}
							<a
								class="w-fit text-base text-foreground leading-[22px] font-semibold underline decoration-border underline-offset-4 hover:decoration-foreground"
								href={resolve(request.resource_url as '/')}
							>
								{name}
							</a>
						{:else}
							<p class="text-base leading-[22px] font-semibold">{name}</p>
						{/if}
						<p class="font-mono text-xs leading-5 text-muted-foreground">
							Requested by {request.requested_by_email ?? 'an unknown member'} · {requestedAgo(request.created_at, now)}
						</p>
					</div>
					{#if denyingId !== request.id}
						<div class="flex shrink-0 gap-1.5">
							<Button
								id="deny-{request.id}"
								variant="outline"
								aria-disabled={reviewing ? 'true' : undefined}
								onclick={() => startDenial(request.id)}
							>
								Deny <span class="sr-only">{name}</span>
							</Button>
							<!-- aria-disabled keeps focus on the pressed button while the review is pending. -->
							<Button
								aria-disabled={reviewing ? 'true' : undefined}
								aria-busy={busy || undefined}
								onclick={() => review(request.id, 'approve')}
							>
								{#if busy}<Spinner />{/if}
								{kind.approveLabel} <span class="sr-only">{name}</span>
							</Button>
						</div>
					{/if}
				</div>
				{#if reviewError?.id === request.id}
					<Alert.Root variant="destructive">
						<Alert.Description>{reviewError.message}</Alert.Description>
					</Alert.Root>
				{/if}
				{#if denyingId === request.id}
					<div class="flex flex-col gap-2 rounded-sm border bg-muted px-3 py-2.5 md:flex-row md:items-center md:pl-34">
						<Input
							id="denial-reason-{request.id}"
							type="text"
							aria-label="Denial reason"
							placeholder="Reason, sent to the requester"
							class="min-w-0 flex-1 bg-background"
							bind:value={denialReason}
							readonly={reviewing}
							onkeydown={(event) => {
								if (processingApproval) return;
								if (event.key === 'Enter') review(request.id, 'deny', denialReason);
								if (event.key === 'Escape') cancelDenial(request.id);
							}}
						/>
						<div class="flex justify-end gap-2">
							<Button
								variant="ghost"
								aria-disabled={reviewing ? 'true' : undefined}
								onclick={() => {
									if (!processingApproval) cancelDenial(request.id);
								}}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								aria-disabled={reviewing ? 'true' : undefined}
								aria-busy={busy || undefined}
								onclick={() => review(request.id, 'deny', denialReason)}
							>
								{#if busy}<Spinner />{/if}
								Deny request <span class="sr-only">for {name}</span>
							</Button>
						</div>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	<p class="flex items-center gap-2.5 py-5 text-sm leading-5 text-muted-foreground">
		<CheckIcon class="size-3.5 shrink-0 text-success" aria-hidden="true" />
		That’s everything. Approved and denied requests move to Logs.
	</p>
</section>

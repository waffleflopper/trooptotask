<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import AdminPage from '$features/platform-admin/components/AdminPage.svelte';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import { createInboxActions } from '$features/platform-admin/components/inbox/inboxActions.svelte';
	import { createClientClock } from '$features/platform-admin/components/people/clientClock.svelte';
	import EventTimeline from '$features/platform-admin/components/people/EventTimeline.svelte';
	import PersonRegion from '$features/platform-admin/components/people/PersonRegion.svelte';
	import SuspendModal from '$features/platform-admin/components/SuspendModal.svelte';
	import { formatAgo, formatDate, formatSignIn } from '$features/platform-admin/peopleFormat';
	import type { PersonRegion as Region } from '$features/platform-admin/contracts';
	import { accessHistoryEntries } from '$features/platform-admin/setupTimeline';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toastStore } from '$lib/stores/toast.svelte';

	import type { PageData } from './$types';

	type Organizations = Awaited<PageData['organizations']> extends Region<infer T> ? T : never;

	let { data }: { data: PageData } = $props();

	const clock = createClientClock();
	const retry = () => void invalidateAll();

	const actions = createInboxActions(() => {});
	onDestroy(() => actions.dispose());

	let suspending = $state(false);
	const suspended = $derived(data.person.state.kind === 'suspended');

	async function reloadSuspension(targetId: string): Promise<boolean> {
		if (targetId !== data.person.id) throw new Error('Person is no longer current');
		await invalidateAll();
		if (targetId !== data.person.id) throw new Error('Person is no longer current');
		return data.person.state.kind === 'suspended';
	}

	async function suspensionSaved(targetId: string, isSuspended: boolean) {
		if ((await reloadSuspension(targetId)) !== isSuspended) throw new Error('Person state could not be refreshed');
		if (targetId !== data.person.id) return;
		suspending = false;
		toastStore.success(isSuspended ? 'Account suspended' : 'Account unsuspended');
	}

	function rolesSentence(memberships: Organizations): string {
		const named = memberships.filter((membership) => membership.organization);
		if (named.length === 0) return 'Not a member of any Organization.';
		return named.map((m) => `${formatAdminLabel(m.role)} in ${m.organization!.name}.`).join(' ');
	}
</script>

{#snippet fact(label: string)}
	<div class="grid gap-0.5 border-b border-border py-2.5 last:border-b-0">
		<dt class="font-mono text-[11px] leading-5 tracking-[0.08em] text-muted-foreground uppercase">{label}</dt>
		<dd class="text-sm leading-5 wrap-anywhere">
			{#if label === 'Email'}
				{data.person.email ?? 'No email on file'}
			{:else if label === 'Last sign-in'}
				{#if clock.now}{formatSignIn(data.person.lastSignInAt, clock.now)}{:else}<span class="invisible"
						>00 min ago</span
					>{/if}
			{:else if label === 'MFA'}
				<Badge variant={data.mfaEnabled ? 'success' : 'secondary'} mono>{data.mfaEnabled ? 'On' : 'Off'}</Badge>
			{:else if label === 'Signed up'}
				{formatDate(data.person.createdAt)}
			{:else}
				<span class="font-mono text-xs">{data.person.id}</span>
			{/if}
		</dd>
	</div>
{/snippet}

{#snippet title()}
	{#await data.accountFacts}
		<Skeleton class="inline-block h-9 w-72 max-w-full align-middle sm:h-11" />
	{:then region}
		{region.status === 'ok' && region.data.name ? region.data.name : data.person.email}
	{:catch}
		{data.person.email}
	{/await}
{/snippet}

{#snippet description()}
	<PersonRegion region={data.organizations} label="Organizations" onRetry={retry} quietOnError>
		{#snippet skeleton()}<Skeleton class="h-6 w-96 max-w-full" />{/snippet}
		{#snippet children(memberships)}{rolesSentence(memberships)}{/snippet}
	</PersonRegion>
{/snippet}

{#snippet commands()}
	<div class="grid justify-items-end gap-1.5">
		<div class="flex flex-wrap items-center justify-end gap-2">
			<form method="POST" action="?/resetPassword" use:enhance={actions.enhanceFor('resetPassword')}>
				<Button
					type="submit"
					variant="outline"
					disabled={actions.pending !== null}
					aria-disabled={actions.pending === 'resetPassword' ? 'true' : undefined}
					aria-busy={actions.pending === 'resetPassword' || undefined}
				>
					{#if actions.pending === 'resetPassword'}<Spinner />{/if}
					Send password reset
				</Button>
			</form>
			<Button
				variant={suspended ? 'outline' : 'destructive'}
				disabled={!data.canSuspend || actions.pending !== null}
				onclick={() => (suspending = true)}
			>
				{suspended ? 'Unsuspend account' : 'Suspend account'}
			</Button>
		</div>
		{#if data.suspendDisabledReason}
			<p class="text-[13px] leading-5 text-muted-foreground">{data.suspendDisabledReason}</p>
		{/if}
	</div>
{/snippet}

<svelte:window onpageshow={(event) => event.persisted && actions.steppingUp && actions.resumeAfterStepUp()} />

<AdminPage>
	<AdminPageHeader eyebrow={`Person · ${suspended ? 'Suspended' : 'Active'}`} {title} {description} {commands} />

	{#if actions.confirmation || actions.notice || actions.error || actions.steppingUp}
		<div class="grid gap-3">
			{#if actions.steppingUp}
				<Alert.Root role="status">
					<Alert.Description>
						This action needs a fresh multi-factor check. Taking you to verify, then back here. Nothing has been changed
						yet.
					</Alert.Description>
				</Alert.Root>
			{/if}
			{#if actions.notice}
				<Alert.Root role="status"><Alert.Description>{actions.notice}</Alert.Description></Alert.Root>
			{/if}
			{#if actions.confirmation}
				<Alert.Root role="status"><Alert.Description>{actions.confirmation}</Alert.Description></Alert.Root>
			{/if}
			{#if actions.error}
				<Alert.Root variant="destructive"><Alert.Description>{actions.error}</Alert.Description></Alert.Root>
			{/if}
		</div>
	{/if}

	{#if data.suspension}
		<Alert.Root variant="destructive">
			<Alert.Title>Suspended {formatDate(data.suspension.suspendedAt)}</Alert.Title>
			<Alert.Description>{data.suspension.reason || 'No reason was recorded.'}</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
		<div class="grid min-w-0 gap-9">
			<section aria-labelledby="person-organizations" class="grid gap-3">
				<h2 id="person-organizations" class="font-heading text-xl leading-none font-bold">Organizations</h2>
				<PersonRegion region={data.organizations} label="Organizations" onRetry={retry}>
					{#snippet skeleton()}
						<div class="border-t border-foreground">
							{#each [0, 1] as row (row)}
								<div class="flex items-center justify-between gap-4 border-b border-border px-3 py-3.5">
									<Skeleton class="h-5 w-48 max-w-full" />
									<Skeleton class="h-5 w-16" />
								</div>
							{/each}
						</div>
					{/snippet}
					{#snippet children(memberships)}
						{#if memberships.length === 0}
							<p class="border-t border-foreground py-3 text-sm text-muted-foreground">
								Not a member of any Organization.
							</p>
						{:else}
							<ul class="border-t border-foreground">
								{#each memberships as membership (membership.organization?.id ?? membership.role)}
									<li class="flex items-center justify-between gap-4 border-b border-border px-3 py-3">
										{#if membership.organization}
											<a
												href={resolve(`/admin/organizations/${membership.organization.id}` as '/admin/organizations')}
												class="min-w-0 truncate text-base font-semibold text-foreground underline-offset-4 hover:underline"
											>
												{membership.organization.name}
											</a>
										{:else}
											<span class="text-muted-foreground">Organization unavailable</span>
										{/if}
										<Badge variant={adminBadgeVariant(membership.role)} mono>{formatAdminLabel(membership.role)}</Badge>
									</li>
								{/each}
							</ul>
						{/if}
					{/snippet}
				</PersonRegion>
			</section>

			<section aria-labelledby="person-history" class="grid gap-3">
				<h2 id="person-history" class="font-heading text-xl leading-none font-bold">Access history</h2>
				<PersonRegion region={data.accessHistory} label="Access history" onRetry={retry}>
					{#snippet skeleton()}
						<div class="border-t border-foreground">
							{#each [0, 1, 2] as row (row)}
								<div class="border-b border-border py-3"><Skeleton class="h-5 w-3/5" /></div>
							{/each}
						</div>
					{/snippet}
					{#snippet children(history)}
						<EventTimeline
							entries={accessHistoryEntries(history)}
							label="Access history"
							empty="No access request is on file for this email."
						/>
					{/snippet}
				</PersonRegion>
			</section>

			<section aria-labelledby="person-activity" class="grid gap-3">
				<div class="flex items-baseline justify-between gap-3">
					<h2 id="person-activity" class="font-heading text-xl leading-none font-bold">Recent activity</h2>
					{#if data.person.email}
						<a
							href={resolve(`/admin/activity?q=${encodeURIComponent(data.person.email)}` as '/admin/activity')}
							class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase underline-offset-4 hover:underline"
						>
							Open in Activity →
						</a>
					{/if}
				</div>
				<PersonRegion region={data.recentActivity} label="Recent activity" onRetry={retry}>
					{#snippet skeleton()}
						<div class="border-t border-foreground">
							{#each [0, 1, 2] as row (row)}
								<div class="grid gap-1.5 border-b border-border py-3">
									<Skeleton class="h-5 w-4/5" />
									<Skeleton class="h-4 w-24" />
								</div>
							{/each}
						</div>
					{/snippet}
					{#snippet children(events)}
						{#if events.length === 0}
							<p class="border-t border-foreground py-3 text-sm text-muted-foreground">No recent activity.</p>
						{:else}
							<ul class="border-t border-foreground">
								{#each events as event (event.id)}
									<li class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-border py-3">
										<p class="text-base leading-snug wrap-anywhere">
											{#if event.severity !== 'info'}
												<span class="sr-only">{event.severity === 'critical' ? 'Critical: ' : 'Warning: '}</span>
											{/if}
											{event.sentence}
										</p>
										<time
											datetime={event.timestamp}
											class="font-mono text-[11px] leading-6 tracking-[0.06em] text-muted-foreground uppercase"
										>
											{#if clock.now}{formatAgo(event.timestamp, clock.now)}{:else}<span class="invisible"
													>00 min ago</span
												>{/if}
										</time>
										{#if event.secondary}
											<p class="text-sm text-muted-foreground wrap-anywhere">{event.secondary}</p>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					{/snippet}
				</PersonRegion>
			</section>
		</div>

		<aside aria-labelledby="person-account" class="rounded-xl border border-border bg-card p-5">
			<h2 id="person-account" class="mb-2 font-heading text-xl leading-none font-bold">Account</h2>
			<dl>
				{@render fact('Email')}
				{@render fact('Last sign-in')}
				{@render fact('MFA')}
				{@render fact('Signed up')}
				{@render fact('ID')}
			</dl>
		</aside>
	</div>
</AdminPage>

{#if data.canSuspend && suspending}
	<SuspendModal
		type="user"
		targetId={data.person.id}
		targetName={data.person.email ?? 'this account'}
		isSuspended={suspended}
		onClose={() => (suspending = false)}
		onComplete={suspensionSaved}
		onReload={reloadSuspension}
	/>
{/if}

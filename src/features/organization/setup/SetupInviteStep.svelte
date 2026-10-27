<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Mail from '@lucide/svelte/icons/mail';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { formatRelativeDate } from '$lib/utils/dates';
	import { settleAction } from '$lib/utils/settleAction';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import MemberInviteForm from '../MemberInviteForm.svelte';
	import { accessLabel, createSettingsMemberAccessWorkspace } from '../settingsMemberAccessWorkspace.svelte';
	import SetupStepFooter from './SetupStepFooter.svelte';
	import { getSetupFlow } from './setupFlow.svelte';
	import type { SetupTeamData } from './teamTypes';

	const flow = getSetupFlow();
	const team = new StreamedValue(() => (page.data.setupTeam as Promise<SetupTeamData> | null) ?? null);
	const ready = $derived(team.current.state === 'ready' ? team.current.value : null);

	const workspace = createSettingsMemberAccessWorkspace(() => ({
		members: [],
		groups: ready?.groups ?? [],
		isOwner: ready?.isOwner ?? false,
		offLanes: []
	}));

	let emailInput = $state<HTMLInputElement | null>(null);
	let pending = $state(false);
	let error = $state<string | null>(null);
	let message = $state<string | undefined>(undefined);
	// The confirmation stays until the next invite starts taking shape.
	let confirmedDraft = $state<string | null>(null);
	const confirmed = $derived(confirmedDraft !== null && confirmedDraft === JSON.stringify(workspace.invite));

	// The members action answers by full path, so the form posts from this route without a Setup copy of the action.
	const action = $derived(`${flow.dashboardHref}/settings/members?/invite`);

	const submit: SubmitFunction = ({ submitter, cancel }) => {
		if (pending) return cancel();
		const stillHere = flow.stillHere();
		pending = true;
		error = null;
		confirmedDraft = null;
		return async (outcome) => {
			if (!stillHere()) return;
			const { result } = outcome;
			if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
				pending = false;
				return;
			}
			await settleAction(
				{
					result,
					// The invitation reshapes the pending list and the rail's Invite your team state, both read at load.
					update: async () => {
						if (result.type === 'success') await invalidate('app:organization-setup');
					}
				},
				{
					isCurrent: stillHere,
					reset: false,
					settled: (failure) => {
						pending = false;
						error =
							failure ??
							(result.type === 'failure' ? String(result.data?.inviteError ?? "Couldn't send the invitation.") : null);
						if (result.type !== 'success' || error) return;
						message = typeof result.data?.inviteMessage === 'string' ? result.data.inviteMessage : undefined;
						workspace.resetInvite();
						confirmedDraft = JSON.stringify(workspace.invite);
					},
					focus: () => [submitter as HTMLElement | null, emailInput]
				}
			);
		};
	};

	function plural(count: number) {
		return `${count} ${count === 1 ? 'invitation' : 'invitations'}`;
	}
</script>

<div class="flex max-w-190 flex-col gap-7">
	<p class="border-l-[3px] border-accent bg-muted px-4 py-3 text-sm leading-5">
		This is the same invitation form as Settings › Members. People you invite appear there too, and nothing is locked
		in.
	</p>

	{#if team.current.state === 'failed'}
		<Alert.Root variant="destructive">
			<Alert.Title>The invitation form could not be loaded</Alert.Title>
			<Alert.Description>
				Invitations are unaffected.
				<Button variant="outline" size="sm" class="mt-2" onclick={() => invalidate('app:organization-setup')}>
					Retry
				</Button>
			</Alert.Description>
		</Alert.Root>
	{:else if !ready}
		<div class="grid gap-7" aria-busy="true">
			<Skeleton class="h-24 w-full" aria-hidden="true" />
			<span class="sr-only">Loading the invitation form</span>
		</div>
	{:else}
		{#if ready.canInvite}
			<MemberInviteForm
				{workspace}
				groups={ready.groups}
				isOwner={ready.isOwner}
				{action}
				{submit}
				{pending}
				loading={pending}
				{error}
				{confirmed}
				{message}
				idPrefix="setup-invite"
				bind:emailInput
			/>
		{:else}
			<p class="text-sm leading-5 text-muted-foreground">Only an owner or an admin can invite people.</p>
		{/if}

		{#if ready.invitations.length > 0}
			<section aria-label="Waiting on them" class="grid">
				<div class="flex items-baseline justify-between gap-3 border-b-2 border-foreground pb-2">
					<h2 class="font-heading text-xl leading-6 font-extrabold uppercase">Waiting on them</h2>
					<p class="font-mono text-xs text-muted-foreground">{plural(ready.invitations.length)}</p>
				</div>
				<ul>
					{#each ready.invitations as invite (invite.id)}
						<li class="flex min-w-0 items-center gap-3 border-b py-3.5">
							<span
								class="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground"
								aria-hidden="true"
							>
								<Mail class="size-4" />
							</span>
							<div class="grid min-w-0 gap-0.5">
								<p class="truncate text-sm font-semibold">{invite.email}</p>
								<p class="font-mono text-xs text-muted-foreground">
									{accessLabel(invite)} · sent {formatRelativeDate(invite.createdAt)} · {invite.funnelStatusLabel}
								</p>
							</div>
						</li>
					{/each}
				</ul>
				<p class="pt-3 text-sm">
					<a class="underline underline-offset-4" href="{flow.dashboardHref}/settings/members">
						Resend or revoke in Settings › Members
					</a>
				</p>
			</section>
		{/if}
	{/if}
</div>

<SetupStepFooter
	save={() => flow.answerUnlessSettled('invite', 'later')}
	blocked={pending ? 'Sending the invitation…' : null}
	note="Invitations send as soon as you press Send invite"
/>

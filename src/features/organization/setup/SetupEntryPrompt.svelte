<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidate } from '$app/navigation';
	import Check from '@lucide/svelte/icons/check';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import type { SetupEntryData, SetupInvitationProgress, SetupPromptChoice } from './entry';
	import { SETUP_STEPS, type SetupStep } from './registry';
	import { postSetupPromptChoice, setupErrorMessage } from './setupClient';
	import { SETUP_GROUP_LABELS } from './setupFlow.svelte';

	interface Props {
		orgId: string;
		orgUrlSegment: string;
		orgName: string;
		entry: Promise<SetupEntryData | null> | null;
		invitationProgress: Promise<SetupInvitationProgress | null> | null;
		/** Called once per visit, when the first entry decision arrives. */
		onDecide?: (prompted: boolean) => void;
	}

	let { orgId, orgUrlSegment, orgName, entry, invitationProgress, onDecide }: Props = $props();

	type Prompt =
		| { kind: 'invitation'; progress: SetupInvitationProgress | null; progressFailed: boolean }
		| { kind: 'newFeature'; step: SetupStep };
	/** The first decision of this Dashboard visit is final, so a reload after a choice never opens a second prompt. */
	type Visit = { phase: 'waiting' } | { phase: 'open'; prompt: Prompt } | { phase: 'closed' };

	let visit = $state<Visit>({ phase: 'waiting' });
	let deferring = $state(false);
	let pending = $state(false);
	let error = $state<string | null>(null);
	let choice = 0;
	onDestroy(() => choice++);

	function decide(next: Visit) {
		visit = next;
		onDecide?.(next.phase === 'open');
	}

	$effect(() => {
		const pendingEntry = entry;
		const pendingProgress = invitationProgress;
		if (!pendingEntry) return;
		let live = true;
		const current = () => live && visit.phase === 'waiting';
		void (async () => {
			const data = await pendingEntry.catch(() => null);
			if (!current()) return;
			const prompt = data?.orgId === orgId ? data.entry.prompt : null;
			if (prompt?.kind === 'invitation') {
				// The invitation opens with its count so the dialog does not grow under the owner's cursor.
				const progress = await Promise.resolve(pendingProgress).then(
					(value) => ({ value: value?.orgId === orgId ? value : null, failed: false }),
					() => ({ value: null, failed: true })
				);
				if (!current()) return;
				decide({
					phase: 'open',
					prompt: { kind: 'invitation', progress: progress.value, progressFailed: progress.failed }
				});
				return;
			}
			const step = prompt?.kind === 'newFeature' ? SETUP_STEPS.find(({ key }) => key === prompt.step) : undefined;
			decide(step ? { phase: 'open', prompt: { kind: 'newFeature', step } } : { phase: 'closed' });
		})();
		return () => {
			live = false;
		};
	});

	function close() {
		choice++;
		pending = false;
		visit = { phase: 'closed' };
	}

	async function choose(prompt: Prompt, picked: SetupPromptChoice) {
		if (pending) return;
		const mine = ++choice;
		pending = true;
		error = null;
		try {
			await postSetupPromptChoice(orgUrlSegment, prompt.kind === 'invitation' ? 'setup' : prompt.step.key, picked);
		} catch (cause) {
			if (mine === choice) {
				error = setupErrorMessage(cause);
				pending = false;
			}
			return;
		}
		if (mine !== choice) return;
		close();
		await invalidate('app:organization-setup');
	}
</script>

{#if visit.phase === 'open'}
	{@const prompt = visit.prompt}
	<AppDialog.Root open voice="announcement" busy={pending} onClose={close}>
		<AppDialog.Content data-setup-prompt={prompt.kind}>
			{#if prompt.kind === 'invitation'}
				<AppDialog.Header eyebrow="For the owner · Organization setup">
					<AppDialog.Title>Finish setting up {orgName}</AppDialog.Title>
					<AppDialog.Description>
						A short walk through your unit and each feature. Skip any step, and turn off what your unit doesn’t use.
					</AppDialog.Description>
				</AppDialog.Header>
				<AppDialog.Body class="grid gap-3">
					{#if prompt.progress}
						{@const { done, total, completedSteps, loadErrors } = prompt.progress}
						<div>
							<p class="flex flex-wrap items-baseline gap-x-2.5 border-b-2 border-foreground pb-2">
								<span class="font-heading text-lg leading-[22px] font-bold" data-setup-done-count>
									{loadErrors.length ? `At least ${done} of ${total}` : `${done} of ${total}`} already done
								</span>
								<span class="text-[13px] leading-[18px] text-muted-foreground">from what you’ve set up so far</span>
							</p>
							<ul class="grid">
								{#each completedSteps as step (step.key)}
									<li class="flex h-[34px] items-center gap-2.5 border-b border-border">
										<Check class="size-4 shrink-0 text-success-foreground" aria-hidden="true" />
										<span class="min-w-0 flex-1 truncate font-semibold">{step.title}</span>
										<span class="shrink-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
											{SETUP_GROUP_LABELS[step.group]}
										</span>
									</li>
								{/each}
							</ul>
							{#if loadErrors.length}
								<p class="pt-2.5 text-muted-foreground">
									Some of your unit’s data didn’t load, so more steps may already be done.
								</p>
							{/if}
						</div>
					{:else if prompt.progressFailed}
						<p class="text-muted-foreground">
							Couldn’t check what your unit already has. Setup checks again when you start.
						</p>
					{/if}
					{#if error}
						<Alert.Root variant="destructive" role="alert">
							<Alert.Description>{error}</Alert.Description>
						</Alert.Root>
					{/if}
				</AppDialog.Body>
				<AppDialog.Footer class="sm:items-center sm:justify-start">
					<Button size="lg" href={`/org/${orgUrlSegment}/setup`} disabled={pending} onclick={close}>Start setup</Button>
					{#if deferring}
						<Button variant="outline" size="lg" disabled={pending} onclick={() => choose(prompt, 'tomorrow')}>
							Remind me tomorrow
						</Button>
						<Button
							variant="ghost"
							size="lg"
							class="sm:ml-auto"
							disabled={pending}
							onclick={() => choose(prompt, 'never')}
						>
							Never ask again
						</Button>
					{:else}
						<Button variant="outline" size="lg" disabled={pending} onclick={() => (deferring = true)}>Not now</Button>
					{/if}
				</AppDialog.Footer>
			{:else}
				<AppDialog.Header eyebrow="New feature · For the owner">
					<AppDialog.Title>{prompt.step.title}</AppDialog.Title>
					<AppDialog.Description>
						A new feature, {prompt.step.title}, has been added. Would you like to set it up?
					</AppDialog.Description>
				</AppDialog.Header>
				<AppDialog.Body class="grid gap-3">
					<p class="border-t-2 border-foreground pt-3">{prompt.step.pitch}</p>
					<p class="text-muted-foreground">
						Setup adds one step for this feature. Everything you’ve already set up stays as it is.
					</p>
					{#if error}
						<Alert.Root variant="destructive" role="alert">
							<Alert.Description>{error}</Alert.Description>
						</Alert.Root>
					{/if}
				</AppDialog.Body>
				<AppDialog.Footer class="sm:items-center sm:justify-start">
					<Button size="lg" href={`/org/${orgUrlSegment}/setup/${prompt.step.slug}`} disabled={pending} onclick={close}>
						Set it up
					</Button>
					<Button variant="outline" size="lg" disabled={pending} onclick={() => choose(prompt, 'tomorrow')}>
						Remind me tomorrow
					</Button>
					<Button
						variant="ghost"
						size="lg"
						class="sm:ml-auto"
						disabled={pending}
						onclick={() => choose(prompt, 'never')}
					>
						Never ask again
					</Button>
				</AppDialog.Footer>
			{/if}
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

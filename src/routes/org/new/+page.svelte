<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { settleAction } from '$lib/utils/settleAction';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);
	let createButton = $state<HTMLButtonElement | null>(null);
	let unexpectedError = $state<string | null>(null);
	// A new submission supersedes the failure on screen; only a failure the server returns for it shows again.
	let supersededForm = $state.raw<ActionData | undefined>(undefined);
	const failure = $derived(form === supersededForm ? undefined : form?.error);
	let active = true;
	onDestroy(() => {
		active = false;
	});
	// Only a 400 rejects the name itself; other failures belong to the request.
	const nameError = $derived(page.status === 400 && failure ? failure : '');
	const requestError = $derived(unexpectedError ?? (failure && !nameError ? failure : ''));
</script>

<svelte:head>
	<title>Create Your Organization - Troop to Task</title>
</svelte:head>

<main class="flex min-h-screen flex-1 items-center justify-center bg-background p-4 sm:p-6">
	<Card.Root class="w-full max-w-[520px]">
		<Card.Header class="gap-2">
			<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-accent uppercase">
				First Organization Setup
			</p>
			<h1 class="font-heading text-4xl leading-none font-extrabold sm:text-5xl">
				{data.emailConfirmed ? 'Create your first Organization' : 'Confirm your email first'}
			</h1>
			<p class="text-base leading-relaxed text-muted-foreground">
				{#if data.emailConfirmed}
					Stand up the workspace your unit will use for rosters, schedules, readiness, and first-run setup.
				{:else}
					Open the newest confirmation email{data.userEmail ? ` for ${data.userEmail}` : ''} before creating a workspace.
				{/if}
			</p>
		</Card.Header>

		<Card.Content>
			<form
				method="POST"
				class="flex flex-col gap-5"
				use:enhance={({ cancel }) => {
					if (loading) return cancel();
					loading = true;
					unexpectedError = null;
					supersededForm = form;
					return async (outcome) => {
						await settleAction(outcome, {
							isCurrent: () => active,
							settled: (error) => {
								unexpectedError = error;
								loading = false;
							},
							focus: () => [nameError ? nameInput : null, createButton]
						});
					};
				}}
			>
				{#if requestError}
					<Alert.Root variant="destructive">
						<Alert.Description>{requestError}</Alert.Description>
					</Alert.Root>
				{/if}

				{#if !data.emailConfirmed}
					<Alert.Root role="status" data-testid="org-new-status">
						<Alert.Title>Email confirmation required</Alert.Title>
						<Alert.Description>{data.emailConfirmationMessage}</Alert.Description>
					</Alert.Root>
				{/if}

				<Field.Root data-invalid={nameError ? true : undefined}>
					<Field.Label for="name">Organization Name</Field.Label>
					<Field.Control>
						<Input
							bind:ref={nameInput}
							id="name"
							name="name"
							type="text"
							placeholder="e.g., 1st Battalion"
							required
							disabled={!data.emailConfirmed}
							aria-invalid={nameError ? true : undefined}
							aria-describedby={nameError ? 'name-error' : undefined}
						/>
					</Field.Control>
					{#if nameError}
						<Field.Error id="name-error">{nameError}</Field.Error>
					{/if}
				</Field.Root>

				<div
					class="flex flex-col gap-2 rounded-md border bg-muted/70 p-4 text-sm leading-relaxed text-muted-foreground"
				>
					<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-accent uppercase">
						Included On Day One
					</p>
					<p>
						Your organization starts with default groups, status types, assignment types, and federal holidays so you
						are not staring at a blank page after setup.
					</p>
					<p>After creation, you will land on the owner dashboard with the first-run setup checklist.</p>
				</div>

				<div class="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
					<Button href="/" variant="outline">Cancel</Button>
					<!-- aria-disabled keeps focus on the pressed button while the request is pending. -->
					<Button
						bind:ref={createButton}
						type="submit"
						disabled={!data.emailConfirmed}
						aria-disabled={loading ? 'true' : undefined}
						aria-busy={loading || undefined}
					>
						{#if loading}<Spinner />{/if}
						{loading ? 'Creating...' : 'Create Organization'}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</main>

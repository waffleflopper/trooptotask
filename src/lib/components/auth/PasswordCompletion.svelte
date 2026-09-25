<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import type { PasswordCompletionState } from '$lib/auth/passwordCompletion';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import AuthNotice from './AuthNotice.svelte';
	import { PasswordMfaChallenge } from '$features/identity';
	let {
		state: completionState,
		oncomplete,
		onrestart
	}: {
		state: Exclude<PasswordCompletionState, null>;
		oncomplete: () => void | Promise<void>;
		onrestart?: () => void | Promise<void>;
	} = $props();
	let currentState = $derived(completionState);
	let loading = $state(false);
	let error = $state('');
	let requiresMfa = $state(false);
	let form = $state<HTMLFormElement>();
	onMount(() => {
		form?.querySelector('button')?.focus();
	});
	async function submit(event: Event) {
		event.preventDefault();
		if (loading || requiresMfa) return;
		loading = true;
		error = '';
		try {
			const response = await fetch('/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: ['complete', 'failed', 'expired'].includes(currentState) ? 'restart' : 'complete'
				})
			});
			if (response.redirected) {
				await goto(response.url);
				return;
			}
			const result = await response.json();
			if (response.status === 403 && result?.code === 'mfa_required') {
				requiresMfa = true;
				return;
			}
			if (
				result?.code === 'password_reconciliation_required' &&
				['started', 'pending', 'failed', 'expired', 'unavailable'].includes(result.state)
			)
				currentState = result.state;
			if (!response.ok || result?.ok !== true || result.error !== undefined) {
				error =
					typeof result?.error === 'string'
						? result.error
						: 'Unable to finish signing out other sessions. Please try again.';
				return;
			}
			if (['complete', 'failed', 'expired'].includes(currentState)) await onrestart?.();
			else await oncomplete();
		} catch {
			error = 'Unable to finish signing out other sessions. Please try again.';
		} finally {
			loading = false;
			await tick();
			if (error) form?.querySelector('button')?.focus();
		}
	}
</script>

{#if requiresMfa}
	<PasswordMfaChallenge
		hint="Verify your authenticator before finishing this password update."
		onverified={async () => {
			requiresMfa = false;
			await tick();
			form?.querySelector('button')?.focus();
		}}
	/>
{:else}
	<AuthNotice
		tone={currentState === 'complete' ? 'success' : 'info'}
		message={currentState === 'complete'
			? 'Your password is updated and other sessions have been signed out.'
			: currentState === 'unavailable'
				? 'Saved password status is temporarily unavailable. Check again before continuing.'
				: currentState === 'started'
					? 'The password update outcome is unknown. Check its saved status before continuing.'
					: currentState === 'failed'
						? 'This attempt did not commit. Start a new password update to try again.'
						: currentState === 'expired'
							? 'This attempt expired or belongs to another session. Try starting a new password update. An unfinished update in another session must expire first.'
							: 'Your password changed. Finish signing out other sessions to complete this update.'}
	/>
	{#if error}<AuthNotice tone="error" message={error} />{/if}
	<form bind:this={form} onsubmit={submit}>
		<Button type="submit" disabled={loading}>
			{#if loading}<Spinner />Working...{:else if currentState === 'complete'}Change password again{:else if currentState === 'failed' || currentState === 'expired'}Start
				new password update{:else if currentState === 'started' || currentState === 'unavailable'}Check password update{:else}Finish
				password update{/if}
		</Button>
	</form>
	{#if currentState === 'expired'}
		<form action="/auth/logout" method="POST"><Button type="submit">Sign out</Button></form>
	{/if}
{/if}

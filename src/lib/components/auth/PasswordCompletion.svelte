<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import type { PasswordCompletionState } from '$lib/auth/passwordCompletion';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import AuthNotice from './AuthNotice.svelte';
	import PasswordMfaChallenge from './PasswordMfaChallenge.svelte';
	let {
		state: completionState,
		oncomplete,
		onrestart
	}: {
		state: Exclude<PasswordCompletionState, null>;
		oncomplete: () => void | Promise<void>;
		onrestart?: () => void | Promise<void>;
	} = $props();
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
				body: JSON.stringify({ action: completionState === 'complete' ? 'restart' : 'complete' })
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
			if (!response.ok || result?.ok !== true || result.error !== undefined) {
				error =
					typeof result?.error === 'string'
						? result.error
						: 'Unable to finish signing out other sessions. Please try again.';
				return;
			}
			if (completionState === 'complete') await onrestart?.();
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

{#if completionState === 'expired' || completionState === 'unavailable'}
	<AuthNotice
		tone="error"
		message="This password completion can no longer be verified. Sign out and sign in again to continue safely."
	/>
	<form bind:this={form} action="/auth/logout" method="POST"><Button type="submit">Sign out</Button></form>
{:else if requiresMfa}
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
		tone={completionState === 'complete' ? 'success' : 'info'}
		message={completionState === 'complete'
			? 'Your password is updated and other sessions have been signed out.'
			: 'Your password changed. Finish signing out other sessions to complete this update.'}
	/>
	{#if error}<AuthNotice tone="error" message={error} />{/if}
	<form bind:this={form} onsubmit={submit}>
		<Button type="submit" disabled={loading}>
			{#if loading}<Spinner />Working...{:else if completionState === 'complete'}Change password again{:else}Finish
				password update{/if}
		</Button>
	</form>
{/if}

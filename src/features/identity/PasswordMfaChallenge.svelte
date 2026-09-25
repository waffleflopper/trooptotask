<script lang="ts">
	import { goto } from '$app/navigation';
	import type { MfaChallengeResponse } from './contracts';
	import { onMount, tick } from 'svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	let {
		onverified,
		id = 'password-mfa-code',
		hint = 'Enter the current 6-digit code from your authenticator app before changing your password.'
	}: { onverified: () => void | Promise<void>; hint?: string; id?: string } = $props();
	let code = $state('');
	let error = $state('');
	let loading = $state(false);
	let form: HTMLFormElement;
	onMount(() => {
		form.querySelector('input')?.focus();
	});
	async function verify(event: Event) {
		event.preventDefault();
		if (loading || code.length !== 6) return;
		loading = true;
		error = '';
		try {
			const response = await fetch('/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});
			if (response.redirected) {
				await goto(response.url);
				return;
			}
			const payload = (await response.json()) as MfaChallengeResponse | null;
			if (!response.ok || payload?.ok !== true) {
				error = payload?.error ?? 'Verification failed.';
				return;
			}
			await onverified();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Verification failed.';
		} finally {
			loading = false;
			await tick();
			if (error) form?.querySelector('input')?.focus();
		}
	}
</script>

{#if error}<AuthNotice tone="error" message={error} />{/if}
<form bind:this={form} onsubmit={verify} class="flex flex-col gap-5">
	<AuthField
		label="Authenticator Code"
		{id}
		disabled={loading}
		{hint}
		value={code}
		oninput={(event) => {
			code = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
		}}
		placeholder="000000"
		maxlength={6}
		autocomplete="one-time-code"
		inputmode="numeric"
	/>
	<Button type="submit" disabled={loading || code.length !== 6}>
		{#if loading}<Spinner />Verifying...{:else}Verify Code{/if}
	</Button>
</form>

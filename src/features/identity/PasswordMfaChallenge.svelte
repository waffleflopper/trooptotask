<script lang="ts">
	import { goto } from '$app/navigation';
	import type { MfaActionResponse } from './contracts';
	import { onMount, tick } from 'svelte';
	import AuthField from './AuthField.svelte';
	import AuthNotice from './AuthNotice.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	let {
		onverified,
		id = 'password-mfa-code',
		hint = 'Enter the current 6-digit code from your authenticator app before changing your password.'
	}: { onverified: () => void | Promise<void>; hint?: string; id?: string } = $props();
	let code = $state('');
	let codeError = $state('');
	let formError = $state('');
	let loading = $state(false);
	let form: HTMLFormElement;
	onMount(() => {
		form.querySelector('input')?.focus();
	});
	async function verify(event: Event) {
		event.preventDefault();
		if (loading || code.length !== 6) return;
		loading = true;
		codeError = formError = '';
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
			const payload = (await response.json()) as MfaActionResponse | null;
			if (!response.ok || payload?.ok !== true) {
				const message = payload?.error ?? 'Verification failed.';
				if (response.status === 401) codeError = message;
				else formError = message;
				return;
			}
			await onverified();
		} catch (e: unknown) {
			formError = e instanceof Error ? e.message : 'Verification failed.';
		} finally {
			loading = false;
			await tick();
			if (codeError || formError) form?.querySelector('input')?.focus();
		}
	}
</script>

{#if formError}<AuthNotice tone="error" message={formError} />{/if}
<form bind:this={form} onsubmit={verify} class="flex flex-col gap-5">
	<AuthField
		label="Authenticator Code"
		{id}
		disabled={loading}
		error={codeError}
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

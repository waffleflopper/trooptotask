<script lang="ts">
	import { goto } from '$app/navigation';
	import type { MfaActionResponse } from './contracts';
	import { tick } from 'svelte';
	import AuthButton from './AuthButton.svelte';
	import AuthNotice from './AuthNotice.svelte';
	import CodeField from './CodeField.svelte';
	let {
		onverified,
		id = 'password-mfa-code',
		hint = 'Enter the current 6-digit code from your authenticator app before changing your password.'
	}: { onverified: () => void | Promise<void>; hint?: string; id?: string } = $props();
	let code = $state('');
	let rejection = $state<{ code: string; message: string } | null>(null);
	let formError = $state('');
	let loading = $state(false);
	let codeField = $state<ReturnType<typeof CodeField>>();
	const codeError = $derived(rejection?.code === code ? rejection.message : '');
	async function verify() {
		if (loading || code.length !== 6) return;
		const submitted = code;
		loading = true;
		rejection = null;
		formError = '';
		try {
			const response = await fetch('/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: submitted })
			});
			if (response.redirected) {
				await goto(response.url);
				return;
			}
			const payload = (await response.json()) as MfaActionResponse | null;
			if (!response.ok || payload?.ok !== true) {
				const message = payload?.error ?? 'Verification failed.';
				if (response.status === 401) rejection = { code: submitted, message };
				else formError = message;
				return;
			}
			await onverified();
		} catch (e: unknown) {
			formError = e instanceof Error ? e.message : 'Verification failed.';
		} finally {
			loading = false;
			await tick();
			if (rejection) codeField?.select();
			else if (formError) codeField?.focus();
		}
	}
</script>

{#if formError}<AuthNotice tone="error" message={formError} />{/if}
<form
	onsubmit={(event) => {
		event.preventDefault();
		void verify();
	}}
	class="flex flex-col gap-8"
>
	<CodeField
		bind:this={codeField}
		bind:value={code}
		label="Authenticator Code"
		{id}
		disabled={loading}
		error={codeError}
		{hint}
		autofocus
		oncomplete={(value) => {
			code = value;
			void verify();
		}}
	/>
	<AuthButton disabled={code.length !== 6} {loading} loadingLabel="Verifying...">Verify Code</AuthButton>
</form>

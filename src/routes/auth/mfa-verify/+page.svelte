<script lang="ts">
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import CodeField from '$features/identity/CodeField.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { sanitizeAuthNextPath, type MfaActionResponse } from '$features/identity/contracts';
	import { tick } from 'svelte';

	let { data } = $props();

	let code = $state('');
	let rejection = $state<{ code: string; message: string } | null>(null);
	let formError = $state('');
	let loading = $state(false);
	let codeField = $state<ReturnType<typeof CodeField>>();

	// A rejected code stays flagged until the user changes it.
	const codeError = $derived(rejection?.code === code ? rejection.message : '');

	function getNextPath(): string | null {
		const next = new URL(window.location.href).searchParams.get('next');
		return sanitizeAuthNextPath(next);
	}

	async function verify() {
		if (loading || code.length !== 6) return;

		const submitted = code;
		rejection = null;
		formError = '';
		loading = true;
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
				const message = payload?.error ?? 'Verification failed';
				if (response.status === 401) rejection = { code: submitted, message };
				else formError = message;
				return;
			}

			await goto(resolve((getNextPath() ?? '/dashboard') as '/'));
		} catch (e: unknown) {
			formError = e instanceof Error ? e.message : 'Verification failed';
		} finally {
			loading = false;
			await tick();
			if (rejection) codeField?.select();
			else if (formError) codeField?.focus();
		}
	}
</script>

<svelte:head>
	<title>Two-Factor Authentication - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Second Factor"
	headline={['One more', 'check.']}
	lede="Your password was right. Now prove the phone is yours, and the session opens."
	steps={{
		label: "If it doesn't work",
		items: [
			{ title: 'Code rejected', detail: 'Wait for the next one.', state: codeError ? 'flagged' : undefined },
			{ title: 'Lost your phone', detail: 'Ask your unit admin for help.' },
			{ title: 'Wrong account', detail: 'Sign out and start over.' }
		]
	}}
	panelEyebrow={data.email ? `Two-factor · ${data.email}` : 'Two-factor authentication'}
	panelTitle="Enter your code"
	panelDescription="Use the current code from your authenticator app."
	alternatives={[{ prompt: 'Not you?', label: 'Sign out', signOut: true }]}
>
	{#if formError}
		<AuthNotice tone="error" message={formError} />
	{/if}

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
			id="mfa-code"
			label="Verification Code"
			error={codeError}
			disabled={loading}
			autofocus
			oncomplete={(value) => {
				code = value;
				void verify();
			}}
		/>

		<AuthButton disabled={code.length !== 6} {loading} loadingLabel="Verifying...">Verify</AuthButton>
	</form>
</AuthShell>

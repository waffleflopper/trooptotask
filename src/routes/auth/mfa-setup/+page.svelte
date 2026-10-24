<script lang="ts">
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import CodeField from '$features/identity/CodeField.svelte';
	import { MFA_CODE_REJECTED_MESSAGE, type MfaActionResponse } from '$features/identity/contracts';
	import { goto } from '$app/navigation';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { onMount, tick } from 'svelte';

	let { data } = $props();

	type Setup =
		| { status: 'starting' }
		| { status: 'ready'; factorId: string; qrCode: string; secret: string }
		| { status: 'enabled' }
		| { status: 'failed'; message: string };

	let setup = $state<Setup>({ status: 'starting' });
	let code = $state('');
	let rejection = $state<{ code: string; message: string } | null>(null);
	let formError = $state('');
	let loading = $state(false);
	let copied = $state(false);
	let left = false;
	let codeField = $state<ReturnType<typeof CodeField>>();

	const codeError = $derived(rejection?.code === code ? rejection.message : '');
	const enabled = $derived(setup.status === 'enabled');
	const groupedSecret = $derived(setup.status === 'ready' ? (setup.secret.match(/.{1,4}/g) ?? []).join(' ') : '');
	const labelClass = 'font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase';

	async function leave() {
		left = true;
		await goto(data.next, { invalidateAll: true });
	}

	async function start() {
		setup = { status: 'starting' };
		try {
			const response = await fetch('/api/auth/mfa/enroll', { method: 'POST' });
			if (left) return;
			if (response.redirected) {
				left = true;
				await goto(response.url);
				return;
			}
			const payload = (await response.json()) as {
				factorId?: string;
				qrCode?: string;
				secret?: string;
				error?: string;
			};
			if (left) return;
			if (response.status === 409) setup = { status: 'enabled' };
			else if (!response.ok || !payload.factorId || !payload.qrCode || !payload.secret)
				setup = { status: 'failed', message: payload.error ?? 'Unable to start MFA setup. Try again.' };
			else setup = { status: 'ready', factorId: payload.factorId, qrCode: payload.qrCode, secret: payload.secret };
		} catch {
			if (!left) setup = { status: 'failed', message: 'Unable to start MFA setup. Try again.' };
		}
	}

	async function verify() {
		if (loading || setup.status !== 'ready' || code.length !== 6) return;
		const submitted = code;
		rejection = null;
		formError = '';
		loading = true;
		try {
			const response = await fetch('/api/auth/mfa/enroll/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ factorId: setup.factorId, code: submitted })
			});
			if (left) return;
			if (response.redirected) {
				left = true;
				await goto(response.url);
				return;
			}
			const payload = (await response.json()) as MfaActionResponse | null;
			if (left) return;
			if (!response.ok || payload?.ok !== true) {
				const message = payload?.error ?? 'Unable to confirm MFA setup. Try again.';
				// An expired session is also a 401, so only the rejection message belongs to the field.
				if (message === MFA_CODE_REJECTED_MESSAGE) rejection = { code: submitted, message };
				else formError = message;
				return;
			}
			await leave();
		} catch {
			if (!left) formError = 'Unable to confirm MFA setup. Try again.';
		} finally {
			loading = false;
			if (!left) {
				await tick();
				if (rejection) codeField?.select();
				else if (formError) codeField?.focus();
			}
		}
	}

	async function cancel() {
		if (setup.status === 'ready') {
			// Best effort: the next setup replaces an unverified factor anyway.
			await fetch('/api/auth/mfa/enroll/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ factorId: setup.factorId })
			}).catch(() => null);
		}
		await leave();
	}

	async function copyKey() {
		if (setup.status !== 'ready') return;
		await navigator.clipboard.writeText(setup.secret);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	onMount(() => {
		void start();
		return () => {
			left = true;
		};
	});
</script>

<svelte:head>
	<title>Set Up Two-Factor Authentication - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Second Factor · Setup"
	headline={['Two keys.', 'One account.']}
	lede="After setup, signing in also asks for a code from your phone. Takes about a minute."
	steps={{
		label: 'Setup · 3 steps',
		items: [
			{ title: 'Get an app', detail: 'Any authenticator app.', state: 'done' },
			{ title: 'Scan the code', detail: 'Or type the setup key.', state: enabled ? 'done' : 'current' },
			{ title: 'Confirm a code', detail: 'Proves the app is linked.', state: enabled ? 'done' : 'upcoming' }
		]
	}}
	panelEyebrow="Two-factor authentication"
	panelTitle={enabled ? 'MFA is on' : 'Scan the code'}
	panelDescription={enabled
		? 'This account already asks for a code at sign-in.'
		: 'Open your authenticator app, add an account, and point the camera here.'}
	alternatives={enabled ? [] : [{ prompt: 'Not ready yet?', label: 'Cancel setup', onclick: cancel }]}
>
	{#if enabled}
		<AuthButton type="button" onclick={leave}>Back to security</AuthButton>
	{:else if setup.status === 'failed'}
		<AuthNotice tone="error" message={setup.message} />
		<AuthButton type="button" onclick={start}>Try again</AuthButton>
	{:else}
		{#if formError}
			<AuthNotice tone="error" message={formError} />
		{/if}

		<div class="flex flex-wrap gap-6">
			<div class="size-44 shrink-0 overflow-hidden rounded-lg border border-border bg-white p-2">
				{#if setup.status === 'ready'}
					<img src={setup.qrCode} alt="QR code for your authenticator app" class="size-full" />
				{:else}
					<Skeleton class="size-full" />
				{/if}
			</div>
			<div class="flex w-[190px] flex-col gap-2">
				<p class="{labelClass} text-muted-foreground">Can't scan? Type this key</p>
				{#if setup.status === 'ready'}
					<p class="font-mono text-[17px] leading-[26px] font-medium tracking-[0.06em] break-all" data-setup-key>
						{groupedSecret}
					</p>
					<button
						type="button"
						onclick={copyKey}
						class="mt-auto inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground underline decoration-1 underline-offset-[3px]"
					>
						<CopyIcon class="size-4" aria-hidden="true" />
						<span aria-live="polite">{copied ? 'Copied' : 'Copy key'}</span>
					</button>
				{:else}
					<Skeleton class="h-[78px] w-full" />
					<Skeleton class="mt-auto h-5 w-24" />
				{/if}
			</div>
		</div>

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
				id="mfa-setup-code"
				label="6-digit code from the app"
				error={codeError}
				disabled={loading || setup.status !== 'ready'}
				autofocus={setup.status === 'ready'}
				oncomplete={(value) => {
					code = value;
					void verify();
				}}
			/>
			<AuthButton disabled={code.length !== 6 || setup.status !== 'ready'} {loading} loadingLabel="Verifying...">
				Verify and turn on
			</AuthButton>
		</form>
	{/if}
</AuthShell>

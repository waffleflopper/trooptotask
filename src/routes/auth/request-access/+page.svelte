<script lang="ts">
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthField from '$features/identity/AuthField.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import { resolve } from '$app/paths';
	import { ACCESS_REQUEST_HEARD_ABOUT_OPTIONS } from '$features/identity/index';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { formatDate, formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';

	let email = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let reason = $state('');
	let heardAbout = $state('');
	let heardAboutDetails = $state('');
	let loading = $state(false);
	let receipt = $state<{ name: string; email: string; at: Date } | null>(null);
	let errorMsg = $state('');

	const submittedDay = $derived(receipt ? formatDate(receipt.at) : '');
	const submittedTime = $derived(
		receipt
			? `${String(receipt.at.getHours()).padStart(2, '0')}${String(receipt.at.getMinutes()).padStart(2, '0')}`
			: ''
	);
	const submittedFacts = $derived([
		{ label: 'Name', value: receipt?.name ?? '', class: 'text-[15px]' },
		{ label: 'Email', value: receipt?.email ?? '', class: 'text-[15px] font-semibold' },
		{ label: 'Submitted', value: `${formatDayMonthYear(submittedDay)} · ${submittedTime}`, class: 'font-mono text-sm' }
	]);
	const labelClass = 'font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase';

	const heardAboutLabel = $derived(
		ACCESS_REQUEST_HEARD_ABOUT_OPTIONS.find((option) => option.value === heardAbout)?.label ?? 'Select a source'
	);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;

		errorMsg = '';
		if (!heardAbout) {
			errorMsg = 'Select how you heard about TroopToTask';
			return;
		}

		loading = true;
		const sent = {
			email,
			firstName,
			lastName,
			heardAbout,
			heardAboutDetails: heardAboutDetails || undefined,
			reason: reason || undefined
		};

		try {
			const res = await fetch('/api/access-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(sent)
			});

			if (!res.ok) {
				const data = await res.json();
				errorMsg = data.error || data.message || 'Something went wrong. Please try again.';
				return;
			}

			receipt = { name: `${sent.firstName} ${sent.lastName}`, email: sent.email, at: new Date() };
		} catch {
			errorMsg = 'Something went wrong. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Request Access - Troop to Task</title>
</svelte:head>

{#if receipt}
	<AuthShell
		eyebrow="Reviewed Access"
		headline={['Request in.', 'Stand by.']}
		lede="Nothing else to do here. Watch your inbox for the Account Setup Link."
		steps={{
			label: 'Where your request is',
			items: [
				{ title: 'Submitted', detail: `Received ${formatDayMonth(submittedDay)}, ${submittedTime}.`, state: 'done' },
				{ title: 'Under review', detail: 'In the queue now.', state: 'current' },
				{ title: 'Setup link arrives', detail: 'By email. Works for 14 days.', state: 'upcoming' }
			]
		}}
		panelEyebrow="Access request · Received"
		panelTitle="Request submitted"
		panelDescription="If it's approved, we'll email the address below."
		alternatives={[
			{ prompt: 'Link expired or replaced?', label: 'Request a fresh setup link', href: resolve('/auth/renew-invite') }
		]}
	>
		<dl role="status" class="flex flex-col">
			{#each submittedFacts as fact (fact.label)}
				<div class="flex items-baseline gap-4 border-b border-border py-3">
					<dt class="w-28 shrink-0 {labelClass} text-muted-foreground">{fact.label}</dt>
					<dd class="min-w-0 break-words {fact.class}">{fact.value}</dd>
				</div>
			{/each}
		</dl>

		<div
			class="flex flex-col gap-1.5 rounded-md border border-accent/25 border-l-[3px] border-l-accent bg-accent/5 px-4 py-3.5"
		>
			<p class="{labelClass} text-accent-text">The link works for 14 days</p>
			<p class="text-sm leading-5 text-foreground">
				Use it once it arrives. If it expires or a newer one replaces it, request a fresh link and open the newest
				email.
			</p>
		</div>

		<AuthButton href={resolve('/auth/login')}>Back to sign in</AuthButton>
	</AuthShell>
{:else}
	<AuthShell
		eyebrow="Reviewed Access"
		headline={['New here?', 'Fall in.']}
		lede="A person reviews every request. Approved users get an Account Setup Link by email."
		steps={{
			label: 'What happens next',
			items: [
				{ title: 'You submit', detail: 'Name, email, how you heard.' },
				{ title: 'We review', detail: 'A person checks every request.' },
				{ title: 'Setup link arrives', detail: 'By email. Works for 14 days.' }
			]
		}}
		panelEyebrow="Access request"
		panelTitle="Request access"
		panelDescription="For people whose unit isn't on TroopToTask yet."
		alternatives={[
			{ prompt: 'Already approved?', label: 'Request a fresh setup link', href: resolve('/auth/renew-invite') },
			{ prompt: 'Already have an account?', label: 'Sign in', href: resolve('/auth/login') }
		]}
	>
		{#if errorMsg}
			<AuthNotice tone="error" message={errorMsg} />
		{/if}

		<form onsubmit={handleSubmit} class="flex flex-col gap-8">
			<div class="flex flex-col gap-5">
				<div class="grid gap-5 sm:grid-cols-2 sm:gap-3">
					<AuthField label="First Name" id="firstName" bind:value={firstName} required autocomplete="given-name" />
					<AuthField label="Last Name" id="lastName" bind:value={lastName} required autocomplete="family-name" />
				</div>

				<AuthField
					label="Email Address"
					id="email"
					type="email"
					bind:value={email}
					required
					autocomplete="email"
					hint="Some @army.mil and @health.mil inboxes filter our emails. A personal address is fine."
				/>

				<Field.Root class="gap-2">
					<Field.Label for="heardAbout" class={labelClass}>How did you hear about us?</Field.Label>
					<Select.Root type="single" bind:value={heardAbout}>
						<Select.Trigger id="heardAbout" class="w-full data-[size=default]:h-11 bg-card px-3.5 font-body text-base">
							{heardAboutLabel}
						</Select.Trigger>
						<Select.Content>
							{#each ACCESS_REQUEST_HEARD_ABOUT_OPTIONS as option (option.value)}
								<Select.Item value={option.value} label={option.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Root>

				{#if heardAbout === 'other'}
					<AuthField
						label="Where did you hear about it?"
						id="heardAboutDetails"
						inputElement="textarea"
						bind:value={heardAboutDetails}
						rows={2}
						optional
					/>
				{/if}

				<AuthField
					label="Unit and Role"
					id="reason"
					inputElement="textarea"
					bind:value={reason}
					rows={2}
					optional
					placeholder="e.g. 1SG, B Co, 2-87 IN. Taking over readiness tracking."
				/>
			</div>

			<AuthButton disabled={!heardAbout} {loading} loadingLabel="Submitting...">Submit Request</AuthButton>
		</form>
	</AuthShell>
{/if}

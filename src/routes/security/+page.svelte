<script lang="ts">
	import PublicBand from '$lib/components/public/PublicBand.svelte';
	import PublicButton from '$lib/components/public/PublicButton.svelte';
	import PublicHeading from '$lib/components/public/PublicHeading.svelte';
	import PublicHero from '$lib/components/public/PublicHero.svelte';
	import PublicRow from '$lib/components/public/PublicRow.svelte';
	import PublicSection from '$lib/components/public/PublicSection.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';
	import { monoLabel } from '$lib/components/public/layout';

	let { data } = $props();

	const specs = [
		{ term: 'NIST 800-171', detail: 'Aligned controls' },
		{ term: 'AES-256', detail: 'Encryption at rest' },
		{ term: 'TLS 1.2+', detail: 'In transit, HSTS enforced' },
		{ term: 'US-hosted', detail: 'All infrastructure' }
	];

	const providers = [
		{ name: 'Vercel', role: 'Application hosting and delivery', detail: 'SOC 2 Type II' },
		{ name: 'Supabase', role: 'Database, sign-in and file storage', detail: 'SOC 2 Type II · AWS, isolated tenancy' },
		{ name: 'Region', role: 'United States', detail: 'All infrastructure' }
	];

	const families = [
		{ id: '3.1', name: 'Access Control' },
		{ id: '3.3', name: 'Audit and Accountability' },
		{ id: '3.5', name: 'Identification and Authentication' },
		{ id: '3.6', name: 'Incident Response' },
		{ id: '3.13', name: 'System and Communications Protection' },
		{ id: '3.14', name: 'System and Information Integrity' }
	];

	const keepOut = [
		'Classified information of any kind',
		'Highly sensitive operational details',
		'Anything your command or cyber office has said stays out'
	];
</script>

<svelte:head>
	<title>Security — Troop to Task</title>
	<meta name="description" content="Security practices and NIST 800-171 alignment information for Troop to Task." />
</svelte:head>

<PublicShell signedIn={data.signedIn} active="security" showCta={false}>
	<PublicHero lines={['Your roster,', 'protected.']}>
		TroopToTask aligns with NIST SP 800-171 for protecting Controlled Unclassified Information. Every unit's data is
		treated as CUI-equivalent. The platform is built for unclassified environments only. Last reviewed May 2026.
		{#snippet aside()}
			<dl class="m-0 border-t-2 border-chrome-text">
				{#each specs as spec (spec.term)}
					<div
						class="flex min-h-12 items-center justify-between gap-4 border-b border-chrome-border py-3 font-body text-lg leading-[22px]"
					>
						<dt class="{monoLabel} text-chrome-text">{spec.term}</dt>
						<dd class="m-0 text-right font-light text-chrome-text-muted">{spec.detail}</dd>
					</div>
				{/each}
			</dl>
		{/snippet}
	</PublicHero>

	<PublicSection>
		<PublicHeading lines={['Treated like', 'it matters.']}>
			Names, ranks, unit assignments, training records, counseling notes and availability. This is what protects every
			one of them.
		</PublicHeading>
		<div class="border-t-2 border-foreground">
			<PublicRow num="01" label="Classification" title="All customer data is handled as CUI-equivalent.">
				<p>
					TroopToTask does not process, store or transmit classified information at any level. It is designed for
					unclassified environments only.
				</p>
			</PublicRow>
			<PublicRow num="02" label="Encryption" title="Encrypted in transit and at rest.">
				<p>
					TLS 1.2 or higher between your browser and our servers, enforced with HSTS so cleartext and downgrade
					connections are blocked. Databases, backups and file storage are encrypted with AES-256 using managed keys.
				</p>
			</PublicRow>
			<PublicRow num="03" label="Access" title="Protected actions are checked at two layers.">
				<p>
					Sign-in supports multi-factor authentication, and sessions expire after 24 hours. Role-based permissions in
					the app sit on top of row-level security in the database, which keeps each unit's records isolated. Sensitive
					documents use short-lived signed links.
				</p>
			</PublicRow>
			<PublicRow num="04" label="Audit" title="Security events leave a trail.">
				<p>
					Sign-ins, permission changes, data changes and admin actions are logged with who, what, which record and when.
					Logs are kept for one year and leave out full record contents.
				</p>
			</PublicRow>
		</div>
	</PublicSection>

	<PublicSection tone="dark">
		<PublicHeading lines={['Proven platforms.', 'Aligned controls.']} tone="dark">
			Hosted in the United States on providers with established security programs, with controls mapped to NIST SP
			800-171 Rev 2.
		</PublicHeading>
		<div class="flex flex-col gap-12 xl:flex-row xl:items-start xl:justify-between xl:gap-16">
			<div class="min-w-0 xl:w-[560px]">
				<h3
					class="{monoLabel} m-0 flex h-12 items-center border-b border-chrome-border font-normal text-chrome-text-muted"
				>
					Infrastructure
				</h3>
				<dl class="m-0">
					{#each providers as provider (provider.name)}
						<div
							class="flex flex-col gap-2 border-b border-chrome-border py-5 sm:grid sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-0"
						>
							<dt class="{monoLabel} text-chrome-text sm:pt-1">{provider.name}</dt>
							<dd class="m-0 flex flex-col gap-1 font-body text-lg leading-6">
								<span class="text-chrome-text">{provider.role}</span>
								<span class="font-light text-chrome-text-muted">{provider.detail}</span>
							</dd>
						</div>
					{/each}
				</dl>
			</div>
			<div class="min-w-0 xl:w-[600px]">
				<h3
					class="{monoLabel} m-0 flex h-12 items-center border-b border-chrome-border font-normal text-chrome-text-muted"
				>
					NIST SP 800-171 control families
				</h3>
				<ul class="m-0 list-none p-0">
					{#each families as family (family.id)}
						<li class="flex min-h-14 items-center border-b border-chrome-border py-3">
							<span class="{monoLabel} w-20 shrink-0 text-chrome-accent">{family.id}</span>
							<span class="font-body text-lg leading-[22px] text-chrome-text">{family.name}</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</PublicSection>

	<PublicSection>
		<div class="flex flex-col gap-12 xl:flex-row xl:justify-between xl:gap-16">
			<div class="flex flex-col gap-12 xl:w-[420px] xl:shrink-0">
				<PublicHeading lines={['Use it with', 'judgment.']} />
				<p class="m-0 font-body text-lg leading-7 font-light text-muted-foreground">
					FedRAMP and formal federal procurement are a separate review. They do not, by themselves, decide whether a
					tool is useful, secure and workable inside your local policy and approval chain.
				</p>
			</div>
			<div class="min-w-0 border-t-2 border-foreground xl:w-[764px]">
				<h3
					class="{monoLabel} m-0 flex min-h-12 items-center border-b border-border py-3 font-normal text-muted-foreground"
				>
					Keep these in approved government systems
				</h3>
				<ul class="m-0 list-none p-0">
					{#each keepOut as item (item)}
						<li
							class="flex min-h-16 flex-col justify-center gap-1 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-start sm:gap-0"
						>
							<span class="{monoLabel} w-40 shrink-0 text-destructive-text">Keep out</span>
							<span class="font-body text-lg leading-[22px] text-foreground">{item}</span>
						</li>
					{/each}
				</ul>
				<p class="m-0 pt-8 font-body text-lg leading-7 font-light text-muted-foreground sm:pl-40">
					The aim is a secure, dependable tool leaders can trust today, strengthened over time for more demanding
					compliance environments.
				</p>
			</div>
		</div>
	</PublicSection>

	<PublicBand
		lines={['Found a vulnerability?', 'Tell us first.']}
		copy="Email security@trooptotask.org. We acknowledge reports within 48 hours and aim to share a resolution timeline within 5 business days. Please allow reasonable time before public disclosure."
	>
		{#snippet action()}
			<PublicButton href="mailto:security@trooptotask.org?subject=Security%20vulnerability%20report"
				>Email Security</PublicButton
			>
		{/snippet}
	</PublicBand>
</PublicShell>

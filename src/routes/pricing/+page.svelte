<script lang="ts">
	import PublicContentSection from '$lib/components/public/PublicContentSection.svelte';
	import PublicPageHeader from '$lib/components/public/PublicPageHeader.svelte';
	import PublicPricingTier from '$lib/components/public/PublicPricingTier.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();

	const plans = [
		{
			name: 'Free',
			price: '$0',
			description: 'For squad leaders and small teams that need a clean roster, calendar, and readiness picture fast.',
			features: ['Up to 20 personnel', '1 organization', '3 exports per month', 'Full platform access during beta'],
			ctaLabel: 'Get Started Free',
			ctaHref: '/auth/login'
		},
		{
			name: 'Team',
			price: '$5',
			description:
				'For platoon-level leadership keeping one formation aligned without juggling spreadsheets and whiteboards.',
			features: [
				'Up to 80 personnel',
				'1 organization',
				'Unlimited exports',
				'Full platform access with team-scale capacity'
			],
			ctaLabel: 'Get Started',
			ctaHref: '/auth/login',
			highlighted: true,
			badge: 'Most Popular'
		},
		{
			name: 'Unit',
			price: '$12',
			description:
				'For company commanders and staff sections managing multiple elements under one operational picture.',
			features: [
				'Up to 500 personnel',
				'Up to 3 organizations',
				'Unlimited exports',
				'Full platform access across the unit'
			],
			ctaLabel: 'Get Started',
			ctaHref: '/auth/login'
		},
		{
			name: 'Enterprise',
			price: 'Contact us',
			showPriceNote: false,
			description: 'For larger formations that need a capacity review, onboarding support, or a custom billing path.',
			features: [
				'Capacity review for larger formations',
				'Multi-organization planning',
				'Unlimited exports',
				'Custom capacity and support terms'
			],
			ctaLabel: 'Contact Support',
			ctaHref: 'mailto:support@trooptotask.com'
		}
	];

	const billingNotes = [
		{
			title: 'No feature gating',
			body: 'Plans scale by formation size, not by holding back core workflows. Calendar, training, counseling, onboarding, and assignments stay available at every tier.'
		},
		{
			title: 'Beta stays simple',
			body: 'The beta period is fully free. No credit card is required now, and beta organizations get clear notice plus a grace period before any subscription is enforced.'
		},
		{
			title: 'Read-only if you outgrow a plan',
			body: 'If your organization exceeds its cap, the workspace stays visible and exportable. You just cannot add or edit more records until the tier or enterprise arrangement matches your size again.'
		}
	];

	const faqs = [
		{
			question: 'Is the beta really free?',
			answer:
				'Yes. During the beta phase every feature and plan is free, with no credit card required. If pricing activates later, beta users get advance notice and a grace period before any charge.'
		},
		{
			question: 'What happens if I exceed my personnel cap?',
			answer:
				'Your organization moves into read-only mode. Leaders can still view and export everything, but new records and edits pause until the tier or enterprise arrangement fits your formation again.'
		},
		{
			question: 'Can I cancel anytime?',
			answer:
				'Yes. You can cancel at any time. Your organization drops back to the free tier limits, and your data stays accessible for review and export.'
		},
		{
			question: 'Are any workflows restricted by plan?',
			answer:
				'No. Plans differ by scale, not by feature list. The full platform stays available across tiers so leadership workflows stay consistent as you grow.'
		}
	];

	const trustSignals = ['NIST 800-171 aligned', 'AES-256 encryption', 'Audit logged by default'];
</script>

<svelte:head>
	<title>Pricing - Troop to Task</title>
	<meta
		name="description"
		content="Simple, transparent pricing for Troop to Task. Free for small teams, affordable plans for larger units."
	/>
</svelte:head>

<PublicShell
	user={data.user}
	active="pricing"
	bodyClass="pricing-page"
	roadmapHref="/#roadmap"
	ctaTitleBefore="Ready to get"
	ctaEmphasis="organized?"
	ctaSubtitle="Free during beta. Set up fast, keep the whole unit aligned, and worry about billing later."
>
	<PublicPageHeader label="Pricing">
		{#snippet title()}Simple, transparent <em>pricing.</em>{/snippet}
		<p>No feature gating. One platform, sized for the formation you are actually leading.</p>
		<div class="beta-banner">
			<span class="beta-banner__label">Beta Status</span>
			<p>
				All plans are currently free. When paid subscriptions begin, beta organizations will receive advance notice and
				a generous grace period before anything changes.
			</p>
		</div>
	</PublicPageHeader>

	<section class="pricing-overview">
		<div class="pricing-overview__inner">
			<div class="pricing-brief">
				<div class="pricing-brief__intro">
					<div class="pricing-brief__label">Pricing Brief</div>
					<h2>Built for the same platform, scaled for different formations.</h2>
				</div>
				<p>
					TroopToTask does not hide core workflows behind higher tiers. The plan changes with your headcount and
					reporting needs, not with which features leadership is allowed to use.
				</p>

				<div class="pricing-brief__signals">
					{#each trustSignals as signal (signal)}
						<div>{signal}</div>
					{/each}
				</div>
			</div>

			<div class="pricing-grid">
				{#each plans as plan (plan.name)}
					<div class:pricing-grid__item--enterprise={plan.name === 'Enterprise'} class="pricing-grid__item">
						<PublicPricingTier {...plan} />
					</div>
				{/each}
			</div>
		</div>
	</section>

	<PublicContentSection label="01 // How Billing Works">
		{#snippet title()}Operationally simple, <em>not padded.</em>{/snippet}
		<div class="pricing-note-grid">
			{#each billingNotes as note (note.title)}
				<article class="pricing-note">
					<h3>{note.title}</h3>
					<p>{note.body}</p>
				</article>
			{/each}
		</div>
	</PublicContentSection>

	<PublicContentSection label="02 // Common Questions" alternate>
		{#snippet title()}What leaders usually ask <em>first.</em>{/snippet}
		<div class="faq-list">
			{#each faqs as item (item.question)}
				<article class="faq-item">
					<h3>{item.question}</h3>
					<p>{item.answer}</p>
				</article>
			{/each}
		</div>
	</PublicContentSection>
</PublicShell>

<style>
	.beta-banner {
		display: grid;
		gap: 0.75rem;
		max-width: 38rem;
		margin: 1.5rem auto 0;
		padding: 1rem 1.2rem;
		border: 1px solid color-mix(in srgb, var(--hero-text) 14%, transparent);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--hero-text) 4%, transparent);
		text-align: left;
	}

	.beta-banner__label {
		width: fit-content;
		padding: 3px 8px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--accent) 16%, var(--card));
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.beta-banner p {
		margin: 0;
		font-size: 1rem;
		line-height: 1.7;
		color: var(--hero-muted);
	}

	.pricing-overview {
		padding: clamp(3.5rem, 7vw, 5.5rem) 2rem;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}

	.pricing-overview__inner {
		max-width: 1180px;
		margin: 0 auto;
		display: grid;
		gap: clamp(2rem, 4vw, 3rem);
	}

	.pricing-brief {
		display: grid;
		gap: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.pricing-brief__intro {
		display: grid;
		gap: 1rem;
		max-width: 780px;
	}

	.pricing-brief__label {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
	}

	.pricing-brief h2 {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2rem, 4vw, 3rem);
		font-weight: 700;
		line-height: 0.98;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--foreground);
	}

	.pricing-brief p {
		margin: 0;
		font-size: 1rem;
		line-height: 1.8;
		color: var(--muted-foreground);
	}

	.pricing-brief__signals {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		margin-top: 0.25rem;
	}

	.pricing-brief__signals div {
		padding: 0.85rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.pricing-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.5rem;
		align-items: stretch;
	}

	.pricing-grid__item {
		display: grid;
	}

	.pricing-grid__item--enterprise {
		grid-column: 2;
	}

	.pricing-note-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.pricing-note {
		padding: 1.25rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
	}

	.pricing-note h3,
	.faq-item h3 {
		margin: 0 0 0.5rem;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--foreground);
	}

	.pricing-note p,
	.faq-item p {
		margin: 0;
		font-size: 1rem;
		line-height: 1.75;
		color: var(--muted-foreground);
	}

	.faq-list {
		display: grid;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.faq-item {
		padding: 1rem 0 0;
		border-top: 1px solid var(--border);
	}

	@media (max-width: 980px) {
		.pricing-grid,
		.pricing-note-grid,
		.pricing-brief__signals {
			grid-template-columns: 1fr;
		}

		.pricing-grid__item--enterprise {
			grid-column: auto;
		}

		.pricing-brief {
			gap: 1.25rem;
		}
	}

	@media (max-width: 640px) {
		.pricing-overview {
			padding-inline: 1rem;
		}

		.pricing-brief p,
		.beta-banner p {
			font-size: 1rem;
		}
	}
</style>

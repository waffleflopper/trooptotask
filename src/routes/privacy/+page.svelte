<script lang="ts">
	import PublicContentSection from '$lib/components/public/PublicContentSection.svelte';
	import PublicPageHeader from '$lib/components/public/PublicPageHeader.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Privacy Policy — Troop to Task</title>
	<meta name="description" content="Privacy policy for Troop to Task military unit management software." />
</svelte:head>

<PublicShell user={data.user} bodyClass="legal-page">
	<PublicPageHeader label="Privacy Policy">
		{#snippet title()}Your privacy, <em>respected.</em>{/snippet}
		<p>TroopToTask is committed to protecting your personal information and the personnel data you entrust to us.</p>
		<p class="page-meta">Effective Date: March 8, 2026</p>
	</PublicPageHeader>

	<PublicContentSection label="01 // Information We Collect">
		{#snippet title()}What we collect, and why.{/snippet}
		<p>
			We collect information you provide directly: account info (email, name), organization data, and personnel records
			you enter (names, ranks, unit assignments, contact information, training records, counseling notes, availability
			statuses). We also collect usage data automatically: IP addresses, browser type, pages visited, and timestamps for
			security and audit purposes.
		</p>
	</PublicContentSection>

	<PublicContentSection label="02 // How We Use Your Information" alternate>
		{#snippet title()}Purpose-driven, nothing more.{/snippet}
		<p>
			We use your information to: provide and maintain the TroopToTask service; authenticate your identity and manage
			access; generate audit logs for compliance; send service-related notifications; improve the service based on
			aggregate usage patterns. We do not use your data for advertising, profiling, or any purpose unrelated to
			delivering the service.
		</p>
	</PublicContentSection>

	<PublicContentSection label="03 // Data Storage &amp; Security">
		{#snippet title()}Protected at every layer.{/snippet}
		<p>
			All data is encrypted at rest (AES-256) and in transit (TLS 1.2+). Data is stored on Supabase infrastructure
			hosted in the United States. We implement role-based access controls, audit logging, and security headers aligned
			with NIST SP 800-171. See our <a href="/security">Security page</a> for comprehensive details.
		</p>
	</PublicContentSection>

	<PublicContentSection label="04 // Data Sharing" alternate>
		{#snippet title()}Your data stays yours.{/snippet}
		<p>
			We do not sell, rent, or share your personal information or personnel data with third parties. We may disclose
			information only when required by law, to enforce our terms, or to protect rights and safety. Our infrastructure
			providers (Supabase, Vercel) process data solely to deliver the service under strict data processing agreements.
		</p>
	</PublicContentSection>

	<PublicContentSection label="05 // Data Retention">
		{#snippet title()}Kept only as long as needed.{/snippet}
		<p>
			We retain your data for as long as your account is active. When you delete personnel records, counseling records,
			or other data, it is permanently removed from our database. If you delete your account, all associated data is
			deleted. Audit logs may be retained for compliance purposes for up to 1 year after account deletion.
		</p>
	</PublicContentSection>

	<PublicContentSection label="06 // Your Rights" alternate>
		{#snippet title()}You are in control.{/snippet}
		<p>
			You have the right to: access all data stored about you and your organization; export your data at any time via
			our export features; correct inaccurate information; delete your data and account; request information about how
			your data is processed. Organization owners can manage these rights for their organization's data through the
			application.
		</p>
	</PublicContentSection>

	<PublicContentSection label="07 // Cookies &amp; Tracking">
		{#snippet title()}Essential only, no surveillance.{/snippet}
		<p>
			We use only essential cookies required for authentication and session management. We collect aggregate site
			analytics and performance signals to understand reliability, performance, and product health. We do not use
			third-party advertising pixels, sell analytics data, participate in cross-site tracking or data broker networks,
			or use analytics to profile individual people.
		</p>
	</PublicContentSection>

	<PublicContentSection label="08 // Children's Privacy" alternate>
		{#snippet title()}Not designed for minors.{/snippet}
		<p>
			TroopToTask is designed for use by military personnel and unit leaders. We do not knowingly collect information
			from children under 13. If we become aware that we have collected such information, we will delete it immediately.
		</p>
	</PublicContentSection>

	<PublicContentSection label="09 // Changes to This Policy">
		{#snippet title()}Transparent updates.{/snippet}
		<p>
			We may update this policy to reflect changes in our practices or legal requirements. We will notify users of
			material changes via the application. Continued use after changes constitutes acceptance.
		</p>
	</PublicContentSection>

	<PublicContentSection label="10 // Contact" alternate>
		{#snippet title()}Get in touch.{/snippet}
		<p>For privacy-related inquiries, contact us at:</p>
		<div class="contact-card">
			<svg
				viewBox="0 0 24 24"
				width="20"
				height="20"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
				<polyline points="22,6 12,13 2,6" />
			</svg>
			<a href="mailto:privacy@trooptotask.com">privacy@trooptotask.com</a>
		</div>
	</PublicContentSection>
</PublicShell>

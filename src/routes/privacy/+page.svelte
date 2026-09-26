<script lang="ts">
	import { resolve } from '$app/paths';
	import PublicContactCard from '$lib/components/public/PublicContactCard.svelte';
	import PublicContentSection from '$lib/components/public/PublicContentSection.svelte';
	import PublicPageHeader from '$lib/components/public/PublicPageHeader.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Privacy Policy — Troop to Task</title>
	<meta name="description" content="Privacy policy for Troop to Task military unit management software." />
</svelte:head>

<PublicShell user={data.user}>
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
			access; generate security-relevant audit logs; respond to support requests; send service-related notifications;
			improve the service based on aggregate usage patterns. We do not use your data for advertising, profiling, or any
			purpose unrelated to delivering the service.
		</p>
	</PublicContentSection>

	<PublicContentSection label="03 // Data Storage &amp; Security">
		{#snippet title()}Protected at every layer.{/snippet}
		<p>
			All data is encrypted at rest (AES-256) and in transit (TLS 1.2+). Data is stored on Supabase infrastructure
			hosted in the United States. We implement role-based access controls, security-relevant audit logging, and
			security headers aligned with NIST SP 800-171. See our <a href={resolve('/security')}>Security page</a> for comprehensive
			details.
		</p>
	</PublicContentSection>

	<PublicContentSection label="04 // Data Sharing" alternate>
		{#snippet title()}Your data stays yours.{/snippet}
		<p>
			We do not sell or rent your personal information or personnel data. We may disclose information only when required
			by law, to enforce our terms, or to protect rights and safety. Our service providers process data solely to
			deliver the service under strict data processing agreements: Supabase for database, authentication, and file
			storage; and Vercel for application hosting, analytics, and performance signals.
		</p>
	</PublicContentSection>

	<PublicContentSection id="data-retention" label="05 // Data Retention">
		{#snippet title()}Kept only as long as needed.{/snippet}
		<p>
			Organization data follows record-specific deletion and archive controls. Personnel and related records may be
			archived before permanent removal under your Organization's retention settings. To request account deletion, email
			<a href="mailto:privacy@trooptotask.org">privacy@trooptotask.org</a>. Our team will assist with the request.
			Applicable audit records remain under our one-year retention policy.
		</p>
	</PublicContentSection>

	<PublicContentSection label="06 // Your Rights" alternate>
		{#snippet title()}You are in control.{/snippet}
		<p>
			You have the right to: access all data stored about you and your organization; export your data at any time via
			our export features; correct inaccurate information; request deletion of your account and personal data; request
			information about how your data is processed. Organization owners can manage these rights for their organization's
			data through the application.
		</p>
	</PublicContentSection>

	<PublicContentSection label="07 // Cookies &amp; Tracking">
		{#snippet title()}Essential only, no surveillance.{/snippet}
		<p>
			We use only essential cookies required for authentication and session management. We use Vercel Web Analytics and
			Vercel Speed Insights to collect aggregate site analytics and performance signals, including visited URLs,
			referrers, device and browser information, coarse geolocation, Web Vitals metrics, and timestamps. Vercel
			identifies visits with a request hash, discards session data after 24 hours, and does not require persistent
			analytics cookies. Learn more in <a href="https://vercel.com/legal/privacy-policy">Vercel's Privacy Notice</a>. We
			do not use third-party advertising pixels, sell analytics data, participate in cross-site tracking or data broker
			networks, or use analytics to profile individual people.
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
		<PublicContactCard email="privacy@trooptotask.org" />
	</PublicContentSection>
</PublicShell>

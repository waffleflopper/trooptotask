<script lang="ts">
	import '$lib/components/public/landing/landing.css';
	import PublicShell from '$lib/components/public/PublicShell.svelte';
	import BriefDeck from '$lib/components/public/landing/BriefDeck.svelte';
	import CrossingStage from '$lib/components/public/landing/CrossingStage.svelte';
	import HoursBack from '$lib/components/public/landing/HoursBack.svelte';
	import LandingCta from '$lib/components/public/landing/LandingCta.svelte';
	import LandingFaq from '$lib/components/public/landing/LandingFaq.svelte';
	import Ledger from '$lib/components/public/landing/Ledger.svelte';
	import TrackingScene from '$lib/components/public/landing/TrackingScene.svelte';
	import TrustPlate from '$lib/components/public/landing/TrustPlate.svelte';

	let { data } = $props();

	// The nav turns from night to day once the phase line has crossed it.
	let navScrolled = $state(false);
</script>

<svelte:head>
	<title>TroopToTask — Unit Readiness, Organized</title>
	<meta
		name="description"
		content="TroopToTask replaces scattered spreadsheets, whiteboards, and shared-drive chaos with a structured digital workspace built for how units actually operate."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="TroopToTask" />
	<meta property="og:title" content="TroopToTask — Unit Readiness, Organized" />
	<meta
		property="og:description"
		content="Personnel tracking, accountability, training, onboarding, and readiness in one disciplined system."
	/>
	<meta property="og:url" content="https://trooptotask.org" />
	<meta property="og:image" content="https://trooptotask.org/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="TroopToTask — Unit Readiness, Organized" />
	<meta name="twitter:description" content="A structured digital workspace built for how units actually operate." />
	<meta name="twitter:image" content="https://trooptotask.org/og-image.png" />
</svelte:head>

<PublicShell
	user={data.user}
	bodyClass="landing"
	showClassificationBar={false}
	navOverlay
	{navScrolled}
	showCta={false}
	showFaqLink
>
	<CrossingStage onprogress={(progress) => (navScrolled = progress >= 0.9)} />
	<TrackingScene />
	<BriefDeck />
	<Ledger />
	<HoursBack />
	<TrustPlate />
	<LandingFaq />
	<LandingCta signedIn={Boolean(data.user)} />
</PublicShell>

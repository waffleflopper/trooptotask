<script lang="ts">
	import { resolve } from '$app/paths';
	import AvailableToday from '$lib/components/public/landing/AvailableToday.svelte';
	import DutyDayThesis from '$lib/components/public/landing/DutyDayThesis.svelte';
	import LandingHero from '$lib/components/public/landing/LandingHero.svelte';
	import ScatteredLedger from '$lib/components/public/landing/ScatteredLedger.svelte';
	import ScopedAccess from '$lib/components/public/landing/ScopedAccess.svelte';
	import Testimonials from '$lib/components/public/landing/Testimonials.svelte';
	import TrustFaq from '$lib/components/public/landing/TrustFaq.svelte';
	import WhatsNext from '$lib/components/public/landing/WhatsNext.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();

	const action = $derived(
		data.signedIn
			? { href: resolve('/dashboard?show=all'), label: 'Go to Dashboard' }
			: { href: resolve('/auth/request-access'), label: 'Request Access' }
	);
</script>

<svelte:head>
	<title>TroopToTask — Less Time on Admin, More Time with Soldiers</title>
	<meta
		name="description"
		content="TroopToTask keeps the whole formation current in one place: calendar, personnel, training, evaluations and onboarding, so leaders spend their time training Soldiers."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="TroopToTask" />
	<meta property="og:title" content="TroopToTask — Less Time on Admin, More Time with Soldiers" />
	<meta
		property="og:description"
		content="One system for calendar, personnel, training, evaluations and onboarding, built for the company."
	/>
	<meta property="og:url" content="https://trooptotask.org" />
	<meta property="og:image" content="https://trooptotask.org/og-image.png?v=2" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="TroopToTask: less time on admin, more time with Soldiers. Above a view of the unit dashboard showing 19 of 22 Soldiers available."
	/>
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="TroopToTask — Less Time on Admin, More Time with Soldiers" />
	<meta name="twitter:description" content="One system that keeps the whole formation current." />
	<meta name="twitter:image" content="https://trooptotask.org/og-image.png?v=2" />
	<meta
		name="twitter:image:alt"
		content="TroopToTask: less time on admin, more time with Soldiers. Above a view of the unit dashboard showing 19 of 22 Soldiers available."
	/>
</svelte:head>

<PublicShell signedIn={data.signedIn}>
	<LandingHero {action} />
	<ScatteredLedger />
	<DutyDayThesis />
	<AvailableToday />
	<ScopedAccess />
	<WhatsNext />
	<Testimonials />
	<TrustFaq />
</PublicShell>

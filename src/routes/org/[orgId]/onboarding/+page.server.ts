import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// All onboarding data loading is handled by the sub-layout (+layout.server.ts).
	// This page server load is kept minimal — data flows down from the layout.
	return {};
};

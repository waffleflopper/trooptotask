export const ACCESS_REQUEST_HEARD_ABOUT_OPTIONS = [
	{ value: 'word_of_mouth', label: 'Word of mouth' },
	{ value: 'unit_peer', label: 'Someone in my unit' },
	{ value: 'search_engine', label: 'Search engine (Google, Bing, etc.)' },
	{ value: 'social_media', label: 'Social media' },
	{ value: 'reddit', label: 'Reddit' },
	{ value: 'army_community', label: 'Army community or forum' },
	{ value: 'other', label: 'Other' }
] as const;

export type AccessRequestHeardAbout = (typeof ACCESS_REQUEST_HEARD_ABOUT_OPTIONS)[number]['value'];

export function isAccessRequestHeardAbout(value: string): value is AccessRequestHeardAbout {
	return ACCESS_REQUEST_HEARD_ABOUT_OPTIONS.some((option) => option.value === value);
}

export function getAccessRequestHeardAboutLabel(value: string | null | undefined): string | null {
	return ACCESS_REQUEST_HEARD_ABOUT_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

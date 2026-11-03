interface NavigationEnd {
	readonly url: URL;
}

/**
 * Whether a navigation only changes a shallow entry of the page already showing, such as Help opening, moving between
 * its guides or stepping back over them. The page never unmounts, so its unsaved work is untouched and an unsaved-work
 * guard has nothing to protect. A shallow entry shown on another pathname belongs to another page, so reaching it
 * leaves this one.
 */
export function staysOnPage(navigation: {
	readonly shallow?: boolean;
	readonly from?: NavigationEnd | null;
	readonly to: NavigationEnd | null;
}): boolean {
	const { shallow, from, to } = navigation;
	return shallow === true && !!from && !!to && from.url.pathname === to.url.pathname;
}

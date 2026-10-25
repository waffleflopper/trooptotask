/**
 * Where a notification's link opens from inside an Organization. Stored links stay Organization-agnostic, so an
 * Account link such as `/account/feedback/<id>` opens under the Organization the reader is in.
 */
export function notificationHref(link: string, orgUrlSegment: string): `/org/${string}` {
	return (link.startsWith('/account/') ? `/org/${orgUrlSegment}${link}` : link) as `/org/${string}`;
}

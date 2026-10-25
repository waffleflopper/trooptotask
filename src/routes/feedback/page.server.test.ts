import { expect, it } from 'vitest';
import { load } from './+page.server';
import { load as detail } from './[feedbackId]/+page.server';

it('redirects old feedback links to Account while preserving the search', () => {
	expect(() => load({ url: new URL('https://example.test/feedback?from=email') } as never)).toThrow(
		expect.objectContaining({ status: 303, location: '/account/feedback?from=email' })
	);
	expect(() =>
		detail({
			params: { feedbackId: 'saved-id' },
			url: new URL('https://example.test/feedback/saved-id?from=email')
		} as never)
	).toThrow(expect.objectContaining({ status: 303, location: '/account/feedback/saved-id?from=email' }));
});

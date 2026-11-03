import type { HelpGuide } from '../contracts';

export const reviewApprovals: HelpGuide = {
	id: 'review-approvals',
	title: 'Approve archive and delete requests',
	summary: 'Answer requests from members who need approval to archive or delete records.',
	area: 'settings',
	routes: ['settings/approvals'],
	keywords: ['approve', 'approval', 'deny', 'request', 'archive', 'delete', 'pending'],
	access: { role: 'admin' },
	lead: 'Some members need approval before an archive or delete takes effect. Their requests wait on the Approvals page for an owner or admin.',
	steps: [
		{ text: 'In Unit settings, open **Approvals**.', to: 'settings/approvals' },
		{ text: 'Read each request and who sent it.' },
		{ text: 'Press **Approve archive** or **Approve delete** to carry it out.' },
		{ text: 'To turn it down, press **Deny**, give a reason, and press **Deny request**.' }
	],
	note: 'Your reason is sent to the requester.'
};

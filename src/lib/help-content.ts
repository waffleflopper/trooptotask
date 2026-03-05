export interface HelpTopic {
	title: string;
	content: string;
}

export const helpContent: Record<string, HelpTopic> = {
	'calendar': {
		title: 'Calendar',
		content: `
			<p>The calendar shows your unit's daily schedule at a glance. Each column represents a person, and colored badges show their status or assignment for that day.</p>
			<h4>Key features</h4>
			<ul>
				<li><strong>Click a cell</strong> to assign someone to a duty or mark availability</li>
				<li><strong>Status badges</strong> show leave, TDY, appointments, etc.</li>
				<li><strong>Navigation</strong> — use arrows or click the date header to jump to a specific date</li>
			</ul>
		`
	},
	'training-records': {
		title: 'Training Records',
		content: `
			<p>Track individual and unit training requirements. Each training type can have an expiration period so you know when recertification is due.</p>
			<h4>Key features</h4>
			<ul>
				<li><strong>Training types</strong> are managed in Settings and apply to the whole organization</li>
				<li><strong>Record training</strong> by clicking on a person and adding a training entry with a completion date</li>
				<li><strong>Expiration tracking</strong> — training with expiration periods will show as overdue when past due</li>
			</ul>
		`
	},
	'leaders-book': {
		title: "Leader's Book",
		content: `
			<p>The leader's book consolidates key personnel information in one place — counseling records, training status, and personal notes.</p>
			<h4>Key features</h4>
			<ul>
				<li><strong>Counseling records</strong> — track initial, monthly, and event-based counselings</li>
				<li><strong>Development goals</strong> — set and track goals for each soldier</li>
				<li><strong>Documents</strong> — attach PDFs to counseling records</li>
			</ul>
		`
	}
};

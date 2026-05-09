---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up. Use when the user asks for a handoff, context compacting, session summary, or a next-agent continuation brief.
argument-hint: What will the next session be used for?
---

# Handoff

Write a compact handoff document so a fresh agent can continue the work without replaying the entire conversation.

## Process

1. Treat any user-provided arguments as the next session's intended focus. Tailor the handoff toward that work.

2. Create the output file with:

   ```sh
   mktemp -t handoff-XXXXXX.md
   ```

3. Read the generated file before writing to it, even though it should be empty.

4. Write the handoff document to that exact path.

5. Report the path back to the user.

## Content

Include only information the next agent needs to continue:

- Current objective and the user's stated intent.
- Important decisions, constraints, and scope boundaries from the conversation.
- Relevant repo state, commands run, verification status, and blockers.
- Specific files, issues, PRs, docs, commits, diffs, or URLs the next agent should inspect.
- Suggested skills for the next session, if any, with a short reason for each.
- Clear next steps, ordered by what should happen first.

Do not duplicate content already captured in other durable artifacts such as PRDs, plans, ADRs, issues, commits, or diffs. Reference those artifacts by path or URL instead.

Keep the document concise. Prefer links and paths over copied prose when the source already exists elsewhere.

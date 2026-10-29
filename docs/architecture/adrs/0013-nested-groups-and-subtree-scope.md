# ADR 0013: Nested Groups and subtree scope

## Decision

Groups form a tree of at most three levels beneath an Organization. A Person belongs to one Group at any level, or is Unassigned. A Group grant covers that Group and every sub-group beneath it. Scope reaches down, never up. There is no direct-members-only grant or variation by Feature Lane.

This amends [ADR 0001](0001-v1-authorization-replacement-model.md)'s scope bullet. The Scope Set remains Organization-wide access or a list of Group roots shared by all six lanes. It introduces neither Personnel-specific grants nor a per-feature scope matrix.

The database stores `groups.parent_id` with a same-Organization foreign key. Triggers derive `path`, from root to self, and cascade path changes to descendants. A check caps depth at three. The generated `depth` column is `cardinality(path)`, so a reader knows a Group's level even when its ancestors are hidden. Names are unique among siblings, including top-level Groups. New names cannot contain the import path separator `/`.

SQL decides coverage with `groups.path && access_scope_group_ids`. Admission calls `read_request_member_access` once, returning the stored grant roots and covered Group ids together. The request grant keeps the field name `scopeSet`, with the branded `GroupCoverage` type. TypeScript consumes those covered ids without expanding the tree. Admin-client roster queries keep their explicit Organization and covered-Group filters. Browser contracts receive plain advisory scope facts.

## Structure and Taskings

Creating, renaming, moving, reordering and deleting Groups requires Organization-wide Personnel `configure`. Structure commands and path-changing inserts or updates lock the Organization row before validating. Concurrent moves therefore cannot both pass a cycle check against the old tree.

Order applies to siblings. Deletion removes a whole subtree, deepest first, and reassigns every Person in it to a Group outside that subtree or to Unassigned. A Tasking owned by any Group in the subtree blocks deletion. Only top-level Groups can be pinned. Moving a pinned Group below a parent removes its pins. Pins remain restricted to Organization-wide readers.

A Group Tasking may pick active People from its responsible Group and every sub-group. Moving a Person or Group out of that subtree marks affected active picks Needs review. Returning them does not clear review. Tasking visibility follows downward coverage. Moving Tasking Responsibility remains restricted to Organization-wide Calendar operators.

## Why

Squad and team leaders need access to their own People without receiving the platoon HQ or neighboring squads. Allowing direct members at every level avoids synthetic HQ Groups. The three-level cap keeps each ancestor path bounded while allowing platoon, squad and team structures.

Deriving coverage separately in SQL policies, TypeScript policy checks and privileged roster filters would give three implementations authority over the same rule. SQL resolves coverage once. A branded request type distinguishes the resolved ids from the saved roots and prevents a stored grant from reaching a server consumer that requires coverage.

Existing flat Organizations become trees with one level. Their paths contain only their own ids, and their stored grants remain unchanged. Existing retained Group ids resolve to the same coverage. Empty grants and deleted Group ids cover nothing.

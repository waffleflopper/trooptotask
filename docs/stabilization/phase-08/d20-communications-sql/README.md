# D20 isolated SQL evidence

These are sanitized artifacts from the newly created disposable provider described in [receipt.json](receipt.json). They contain no production connection or credential. The raw run replayed migrations 1–157, passed 53 communications assertions plus 1,144 retained assertions, and cleaned up only its project.

[sha256.json](sha256.json) maps each **original expanded filename** to the SHA-256 of its original bytes. To verify an entry, read the named plain file if present; otherwise decompress its `.gz` archive and hash the expanded bytes. For example, the `isolated-config.toml` entry verifies `gzip.decompress(Path("isolated-config.toml.gz").read_bytes())`, not the compressed archive. This preserves the exact configuration used, including its trailing blank line. The same rule applies to SQL, logs, driver, migration list and container inventories. No artifact content or SQL assertion was rewritten when compressed.

[The current SQL contract](../../../../supabase/tests/communications_rls.sql) matches the archived `communications_rls.sql.gz` expanded hash. Source/artifact review independently reproduced every manifest entry and the before/after existing-container inventories. This is separate from native application verification and does not claim production, remote upgrade or external mail/GitHub execution.

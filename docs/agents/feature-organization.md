# Feature Organization

Use this file when adding or moving feature code.

## Path Aliases

- `$features/*` maps to `src/features/*`.
- `$lib/*` maps to `src/lib/*`.

## Feature Module Shape

- Feature modules should own their `components/`, `stores/`, `utils/`, and types file.
- Import feature code through `$features/feature-name/...`.
- New features should follow the structure already used by neighboring feature modules.

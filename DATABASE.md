# Migrations

## Generation

### Dry Run

```sh
bun run migration:generate-dry-run -- libs/api-schema/src/lib/migrations/DryRun
```

### Without Dry Run

```sh
bun run migration:generate -- libs/api-schema/src/lib/migrations/MigrationName
bun run create-indices
```

`MigrationName` will be replaced with `<timestamp>-<MigrationName>.ts`.

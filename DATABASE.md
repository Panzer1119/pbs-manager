# Migrations

## Generation

### Dry Run

```sh
bun run migration:generate-dry-run -- libs/database-schema/src/lib/migrations/DryRun
```

### Without Dry Run

```sh
bun run migration:generate -- libs/database-schema/src/lib/migrations/MigrationName
bun run create-indices
```

`MigrationName` will be replaced with `<timestamp>-<MigrationName>.ts`.

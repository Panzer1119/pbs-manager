import { createIndex } from "./create-index";

// database-schema
createIndex("database-schema", "index-embeddings.ts", "embeddings", ".embedding.ts");
createIndex("database-schema", "index-entities.ts", "entities", ".entity.ts");
//createIndex("database-schema", "index-errors.ts", "errors", ".error.ts");
//createIndex("database-schema", "index-migrations.ts", "migrations");
//createIndex("database-schema", "index-transformers.ts", "transformers", ".transformer.ts");
//createIndex("database-schema", "index-types.ts", "types", ".type.ts");
//createIndex("database-schema", "index-validators.ts", "validators", ".validator.ts");

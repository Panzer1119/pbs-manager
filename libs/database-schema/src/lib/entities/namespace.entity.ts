import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Tree,
    TreeChildren,
    TreeParent,
} from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { Datastore } from "./datastore.entity";

@Entity()
@Tree("closure-table")
// Parent, Name
// Metadata Deletion IS NULL
@Index(["datastore", "name"], { unique: true, where: '"parent_id" IS NULL AND "metadata_deletion" IS NULL' })
@Index(["datastore", "parent", "name"], {
    unique: true,
    where: '"parent_id" IS NOT NULL AND "metadata_deletion" IS NULL',
})
// Metadata Deletion IS NOT NULL
@Index(["datastore", "name", "metadata.deletion"], {
    unique: true,
    where: '"parent_id" IS NULL AND "metadata_deletion" IS NOT NULL',
})
@Index(["datastore", "parent", "name", "metadata.deletion"], {
    unique: true,
    where: '"parent_id" IS NOT NULL AND "metadata_deletion" IS NOT NULL',
})
export class Namespace {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index()
    @Column()
    datastoreId!: number;

    @ManyToOne(() => Datastore, datastore => datastore.namespaces, { onDelete: "CASCADE", onUpdate: "CASCADE" })
    @JoinColumn({ referencedColumnName: "id" })
    datastore?: Datastore;

    @TreeChildren()
    children!: Namespace[];

    @Index()
    @Column({ nullable: true })
    parentId?: number;

    @TreeParent()
    parent?: Namespace;

    @Index()
    @Column({ length: 255 })
    name!: string;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    // @OneToMany(() => Group, group => group.namespace)
    // groups?: Group[];
}

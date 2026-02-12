import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    Tree,
    TreeChildren,
    TreeParent,
} from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { Datastore } from "./datastore.entity";
import { Group } from "./group.entity";

@Entity()
@Tree("closure-table")
// Parent, Name
//TODO Nulls-not-distinct manually created with migration
@Index(["datastore", "parent", "name"], { unique: true })
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

    @Index()
    @Column({ length: 4095, nullable: true })
    path?: string;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    @OneToMany(() => Group, group => group.namespace)
    groups?: Group[];
}

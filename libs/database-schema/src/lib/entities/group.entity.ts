import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { Datastore } from "./datastore.entity";
import { Namespace } from "./namespace.entity";
import { BackupType } from "../types/backup.type";

@Entity()
// Namespace, Type, Backup ID
// Metadata Deletion IS NULL
@Index(["datastore", "type", "backupId"], {
    unique: true,
    where: '"namespace_id" IS NULL AND "metadata_deletion" IS NULL',
})
@Index(["datastore", "namespace", "type", "backupId"], {
    unique: true,
    where: '"namespace_id" IS NOT NULL AND "metadata_deletion" IS NULL',
})
// Metadata Deletion IS NOT NULL
@Index(["datastore", "type", "backupId", "metadata.deletion"], {
    unique: true,
    where: '"namespace_id" IS NULL AND "metadata_deletion" IS NOT NULL',
})
@Index(["datastore", "namespace", "type", "backupId", "metadata.deletion"], {
    unique: true,
    where: '"namespace_id" IS NOT NULL AND "metadata_deletion" IS NOT NULL',
})
export class Group {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index()
    @Column()
    datastoreId!: number;

    @ManyToOne(() => Datastore, datastore => datastore.groups, { onDelete: "CASCADE", onUpdate: "CASCADE" })
    @JoinColumn({ referencedColumnName: "id" })
    datastore?: Datastore;

    @Index()
    @Column({ nullable: true })
    namespaceId?: number;

    @ManyToOne(() => Namespace, namespace => namespace.groups, {
        nullable: true,
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    @JoinColumn({ referencedColumnName: "id" })
    namespace?: Namespace;

    @Column({ type: "simple-enum", enum: BackupType, enumName: "backup_type" })
    type!: BackupType;

    @Index()
    @Column({ length: 255 })
    backupId!: string;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    // @OneToMany(() => Snapshot, snapshot => snapshot.group)
    // snapshots?: Snapshot[];
}

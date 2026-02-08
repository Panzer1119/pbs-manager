import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDate, IsInt, IsOptional } from "class-validator";
import { CreateDateColumn, DeleteDateColumn, Index, UpdateDateColumn, VersionColumn } from "typeorm";

export class MetadataEmbedding {
    // @nestjs/swagger
    @ApiProperty({ readOnly: true })
    // class-validator
    @IsDate()
    // typeorm
    @Index()
    @CreateDateColumn({ type: "timestamptz" })
    creation!: Date;

    // @nestjs/swagger
    @ApiProperty({ readOnly: true })
    // class-validator
    @IsDate()
    // typeorm
    @Index()
    @UpdateDateColumn({ type: "timestamptz" })
    update!: Date;

    // @nestjs/swagger
    @ApiPropertyOptional({ readOnly: true, nullable: true })
    // class-validator
    @IsOptional()
    @IsDate()
    // typeorm
    @Index({ where: '"metadata_deletion" IS NULL' })
    @DeleteDateColumn({ type: "timestamptz" })
    deletion?: Date;

    // @nestjs/swagger
    @ApiProperty({ description: "The version of the entity", readOnly: true })
    // class-validator
    @IsInt()
    // typeorm
    @VersionColumn({ type: "int", default: 1 })
    version!: number;
}

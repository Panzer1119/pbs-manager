import { ChildEntity } from "typeorm";
import { Archive } from "./archive.entity";
import { ArchiveType } from "../types/archive.type";

@ChildEntity(ArchiveType.File)
export class FileArchive extends Archive {}

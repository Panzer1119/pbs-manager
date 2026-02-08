import * as fg from "fast-glob";
import * as fs from "fs";
import * as path from "path";

export function createIndex(
    libraryName: string,
    indexFileName: string,
    subDirName: string,
    suffix: string = ".ts",
    lineSeparator: string = "\r\n"
) {
    console.log(`Creating ${indexFileName} for library ${libraryName}`);
    const src = `${path.dirname(__dirname)}/libs/${libraryName}/src`.replace(/\\/g, "/");
    if (!fs.existsSync(src)) {
        console.log(`Library ${libraryName} cannot be found. Path does not exist: ${src}`);
        process.exit(1);
    }
    const outDir = `${src}/lib`;
    const subDir = `${outDir}/${subDirName}`;
    const tmpFile = `${outDir}/tmp-${indexFileName}`;
    const outFile = `${outDir}/${indexFileName}`;
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }
    if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
        console.log(`Temp file "${tmpFile}" cleared`);
    }
    const items = fg.sync(`${subDir}/*${suffix}`);
    if (items.length === 0) {
        console.warn(`No files matching "*${suffix}" found in "${subDir}"`);
        return;
    }
    for (const item of items) {
        const filePath = path.relative(outDir, item).replace(/\.ts$/, "").replace(/\\/g, "/");
        const data = `export * from "./${filePath}";${lineSeparator}`;
        fs.writeFileSync(tmpFile, data, { flag: "a+", encoding: "utf-8" });
    }
    if (fs.existsSync(outFile) && fs.existsSync(tmpFile)) {
        const oldData: string = fs.readFileSync(outFile, { encoding: "utf-8" });
        const newData: string = fs.readFileSync(tmpFile, { encoding: "utf-8" });
        if (oldData === newData) {
            fs.unlinkSync(tmpFile);
            console.log(`Same file "${outFile}"`);
            return;
        }
        fs.unlinkSync(outFile);
        console.log(`Old  file "${outFile}" removed`);
    }
    if (fs.existsSync(tmpFile)) {
        fs.renameSync(tmpFile, outFile);
        console.log(`New  file "${outFile}" saved`);
    } else {
        console.warn("Something went wrong");
    }
}

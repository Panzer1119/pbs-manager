import { posix } from "path";
import { ClassConstructor, ClassTransformOptions, plainToInstance } from "class-transformer";
import { validateInstanceSync, ValidationOptions } from "./validation-utils";

export function deleteUndefinedKeys<T extends Record<string, unknown>>(object: T): T {
    Object.keys(object).forEach(key => object[key] === undefined && delete object[key]);
    return object;
}

export function deleteNullKeys<T extends Record<string, unknown>>(object: T): T {
    Object.keys(object).forEach(key => object[key] === null && delete object[key]);
    return object;
}

export function deleteFalsyKeys<T extends Record<string, unknown>>(object: T): T {
    Object.keys(object).forEach(key => !object[key] && delete object[key]);
    return object;
}

export function deleteEmptyStringKeys<T extends Record<string, unknown>>(object: T): T {
    Object.keys(object).forEach(key => object[key] === "" && delete object[key]);
    return object;
}

export function deleteEmptyArrayKeys<T extends Record<string, unknown>>(object: T): T {
    Object.keys(object).forEach(
        key => Array.isArray(object[key]) && Array.from(object[key] as never).length === 0 && delete object[key]
    );
    return object;
}

export function deleteKeys<T extends Record<string, unknown>>(object: T, keys: string[]): T {
    keys.forEach(key => delete object[key]);
    return object;
}

export function deleteInstanceKeys<T, K extends keyof T>(instance: T, keys: K[]): T {
    keys.forEach(key => delete instance[key]);
    return instance;
}

export function sortKeys<T extends object>(object: T): T {
    return Object.fromEntries(Object.entries(object).sort()) as T;
}

export function keepKeys<T extends Record<string, unknown>>(object: T, keys: string[]): T {
    Object.keys(object).forEach(key => !keys.includes(key) && delete object[key]);
    return object;
}

export function keepInstanceKeys<T, K extends keyof T>(instance: T, keys: K[]): T {
    return keepKeys(instance as Record<string, unknown>, keys as string[]) as T;
}

export function replaceWithDefinedKeys<T extends Record<string, unknown>, U extends Record<string, unknown>>(
    target: T,
    source: U
): T & U {
    deleteUndefinedKeys(source);
    return Object.assign(target, source);
}

export function pickInstance<T, K extends keyof T>(cls: ClassConstructor<T>, instance: T, keys: K[]): Pick<T, K> {
    const result: Pick<T, K> = new cls();
    for (const key of keys) {
        result[key] = instance[key];
    }
    return result;
}

export function pickObject<T extends Record<string, unknown>, K extends keyof T>(object: T, keys: K[]): Pick<T, K> {
    const result: Pick<T, K> = {} as Pick<T, K>;
    for (const key of keys) {
        result[key] = object[key];
    }
    return result;
}

export function regExpMatchArrayGroupsToPlainObject(
    regExpMatchArray: RegExpMatchArray | null | undefined
): Record<string, string> {
    return regExpMatchArray?.groups as Record<string, string>;
}

export function regExpMatchArrayGroupsToPlainObjects(
    regExpMatchArrays: (RegExpMatchArray | null | undefined)[] | undefined | null
): Record<string, string>[] {
    return (regExpMatchArrays ?? []).map(regExpMatchArrayGroupsToPlainObject);
}

export type RegExpMatchArrayGroupsTransformationOptions = {
    failIfNoMatch?: boolean;
    trimGroups?: boolean;
    deleteEmptyStringKeys?: boolean;
    skipValidation?: boolean;
    transformOptions?: ClassTransformOptions;
    validationOptions?: ValidationOptions;
};

export function regExpMatchArrayGroupsToInstance<T>(
    cls: ClassConstructor<T>,
    regExpMatchArray: RegExpMatchArray | null | undefined,
    options?: RegExpMatchArrayGroupsTransformationOptions
): T {
    // Check if regExpMatchArray is undefined
    if (regExpMatchArray == undefined) {
        // Check if failIfNoMatch is true
        if (options?.failIfNoMatch) {
            // Throw an error
            throw new Error("The regExpMatchArray is undefined");
        }
        // Return undefined
        return undefined as never;
    }
    // Get the object from the groups
    const object: Record<string, string> = regExpMatchArrayGroupsToPlainObject(regExpMatchArray);
    if (options?.trimGroups) {
        // Trim the groups
        Object.keys(object).forEach(key => (object[key] = object[key]?.trim()));
    }
    if (options?.deleteEmptyStringKeys) {
        // Delete the empty keys
        deleteEmptyStringKeys(object);
    }
    // Transform the object to an instance
    const instance: T = plainToInstance(cls, object, options?.transformOptions);
    if (!options?.skipValidation) {
        // Validate the instance
        validateInstanceSync(instance, options?.validationOptions);
    }
    return instance;
}

export function regExpMatchArrayGroupsToInstances<T>(
    cls: ClassConstructor<T>,
    regExpMatchArrays: (RegExpMatchArray | null | undefined)[] | undefined | null,
    options?: RegExpMatchArrayGroupsTransformationOptions
): T[] {
    return (regExpMatchArrays ?? []).map(regExpMatchArray =>
        regExpMatchArrayGroupsToInstance(cls, regExpMatchArray, options)
    );
}

export function joinPosixPaths(...paths: string[]): string {
    return posix.join(...paths);
}

export function relativePosixPath(from: string, to: string): string {
    return posix.relative(from, to);
}

export function normalizePosixPath(path: string): string {
    return posix.normalize(path);
}

export function dirnamePosixPath(path: string): string {
    return posix.dirname(path);
}

export function basenamePosixPath(path: string, ext?: string | undefined): string {
    return posix.basename(path, ext);
}

export function extnamePosixPath(path: string): string {
    return posix.extname(path);
}

export function timeSync<T>(fn: () => T): { result: T; time: number } {
    const start: number = Date.now();
    const result: T = fn();
    const end: number = Date.now();
    return { result, time: end - start };
}

export async function timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
    const start: number = Date.now();
    const result: T = await fn();
    const end: number = Date.now();
    return { result, time: end - start };
}

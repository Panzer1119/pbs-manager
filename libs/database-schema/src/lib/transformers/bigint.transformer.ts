import { ValueTransformer } from "typeorm";

export class BigIntTransformer implements ValueTransformer {
    constructor(private readonly returnUndefinedForNaN: boolean = true) {}

    from(value?: string): number | undefined {
        if (value != undefined) {
            // return BigInt(value); // This might not work because of:
            // "JSON.stringify() doesn't know how to serialize a BigInt"
            // https://github.com/GoogleChromeLabs/jsbi/issues/30
            return Number(value);
        }
        return undefined;
    }

    to(value: bigint | number | string): string | undefined {
        if (value != undefined) {
            // Check if value is NaN
            if (typeof value === "number" && isNaN(value)) {
                if (this.returnUndefinedForNaN) {
                    return undefined;
                }
                throw new Error("Value is NaN");
            }
            // Check if value is a bigint, number or string
            switch (typeof value) {
                case "bigint":
                    return value.toString();
                case "number":
                case "string":
                    return BigInt(value).toString();
                default:
                    throw new Error(`Unknown type: ${typeof value}`);
            }
        }
        return undefined;
    }
}

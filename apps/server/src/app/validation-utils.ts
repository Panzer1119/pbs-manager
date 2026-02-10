import { ClassConstructor, ClassTransformOptions, plainToInstance } from "class-transformer";
import { validateSync, ValidationError, ValidatorOptions } from "class-validator";
import { deleteUndefinedKeys, pickObject } from "./common-utils";
import { handleValidationErrors, ValidationErrorHandlingOptions } from "./error-utils";

export interface TransformAndValidateConfigWithKeysOptions {
    skipValidation?: boolean;
    transformOptions?: ClassTransformOptions;
    validationOptions?: ValidationOptions;
}

export function transformAndValidateConfigWithKeys<T, K extends keyof T>(
    cls: ClassConstructor<T>,
    plainConfig: Record<string, unknown>,
    keys: K[],
    options?: TransformAndValidateConfigWithKeysOptions
): Pick<T, K> {
    // Pick only the keys we want to use
    plainConfig = pickObject(plainConfig, keys as string[]);
    // Delete all undefined keys
    deleteUndefinedKeys(plainConfig);
    // Transform the plain config to an instance of the class
    const config: T = plainToInstance(cls, plainConfig, options?.transformOptions);
    if (!options?.skipValidation) {
        // Validate the config
        validateInstanceSync(config, options?.validationOptions);
    }
    // Return the config
    return config;
}

export interface ValidationOptions {
    /**
     * If true, the validation will be skipped
     */
    skipValidation?: boolean;
    /**
     * @see {@link ValidatorOptions}
     */
    validatorOptions?: ValidatorOptions;
    /**
     * If true, the errors will be ignored
     */
    ignoreErrors?: boolean;
    /**
     * @see {@link ValidationErrorToStringOptions}
     */
    validationErrorHandlingOptions?: ValidationErrorHandlingOptions;
}

export function validateInstanceSync<T>(instance: T, options?: ValidationOptions): ValidationError[] {
    // Check if skipValidation is true
    if (options?.skipValidation) {
        // Return an empty array
        return [];
    }
    // Validate the instance
    const errors: ValidationError[] = validateSync(instance as object, options?.validatorOptions);
    // Check if ignoreErrors is false
    if (!options?.ignoreErrors) {
        // Handle the validation errors
        handleValidationErrors(errors, options?.validationErrorHandlingOptions);
    }
    // Return the errors
    return errors;
}

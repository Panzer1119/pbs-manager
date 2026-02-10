import { ValidationError } from "class-validator";

/**
 * An interface that represents the options for converting a ValidationError to a string.
 */
export interface ValidationErrorHandlingOptions {
    /**
     * A boolean indicating whether the error should be logged.
     */
    warnOnError?: boolean;
    /**
     * A function that logs the message.
     * @param message The message to log.
     */
    logFunction?: (message?: unknown) => void;
    /**
     * A boolean indicating whether the error should be thrown.
     */
    throwOnError?: boolean;
    /**
     * A boolean indicating whether the message should be decorated with ANSI formatter escape codes for better readability.
     */
    shouldDecorate?: boolean;
    /**
     * A boolean indicating whether the error is a child of an another one.
     */
    hasParent?: boolean;
    /**
     * A string representing the path to the parent of this property.
     */
    parentPath?: string;
    /**
     * A boolean indicating whether the constraint messages should be shown instead of constraint names.
     */
    showConstraintMessages?: boolean;
}

export const defaultValidationErrorToStringOptions: ValidationErrorHandlingOptions = {
    warnOnError: false,
    throwOnError: true,
    shouldDecorate: true,
    hasParent: false,
    parentPath: undefined,
    showConstraintMessages: true,
};

export function handleValidationErrors(
    errors: ValidationError[],
    options: ValidationErrorHandlingOptions = defaultValidationErrorToStringOptions
): void {
    // Check if errors is undefined or empty
    if (!errors?.length) {
        // Return
        return;
    }
    // Build the message
    const message: string = errors
        .map(error =>
            error.toString(
                options?.shouldDecorate,
                options?.hasParent,
                options?.parentPath,
                options?.showConstraintMessages
            )
        )
        .join("\n");
    // Check if warnOnError is true
    if (options?.warnOnError) {
        // Check if logFunction is defined
        if (options?.logFunction) {
            // Log the message
            options?.logFunction(message);
        } else {
            // Log the message
            console.warn(message);
        }
    }
    // Check if throwOnError is true
    if (options?.throwOnError) {
        // Throw an error
        throw new Error(message);
    }
}

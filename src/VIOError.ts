export class VIOError extends Error {
    public name: string = 'VIOError';
    public code: VIOError.Code;
    public constructor(code: VIOError.Code, message: string) { super(message);
        this.name = 'VIOError';
        this.code = code;
    }
    public toString(): string {
        return `${this.name} [${this.code}]: ${this.message}`;
    }
}
export namespace VIOError {
    export enum Code {
        INVALID_HEADER = 'INVALID_HEADER',
        INVALID_UUID = 'INVALID_UUID',
        INVALID_DATA = 'INVALID_DATA',
        UNKNOWN_TYPE = 'UNKNOWN_TYPE',
        UNKNOWN_MODE = 'UNKNOWN_MODE',
        BUFFER_TOO_SHORT = 'BUFFER_TOO_SHORT'
    }
}
export default VIOError;
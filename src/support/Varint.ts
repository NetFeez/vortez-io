/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gemail.com>
 * @license Apache-2.0
 * @description Provides encoding and decoding functionality for variable-length integers (varints) used in the Vortez IO protocol.
 *              Varints are a compact way to encode integers, where smaller numbers take fewer bytes. Each byte uses the lower 7 bits to store data and the highest bit as a continuation flag (1 if more bytes follow, 0 if this is the last byte).
 *              This module includes methods for reading varints from a Uint8Array and writing numbers as varints into a Uint8Array, with error handling for invalid input and buffer overflows.
 */
import VIOError from "../VIOError.js";

export class Varint {
    /**
     * Reads a varint-encoded integer from the given Uint8Array starting at the specified offset.
     * Varints are a compact way to encode integers, where smaller numbers take fewer bytes.
     * Each byte uses the lower 7 bits to store data and the highest bit as a continuation flag (1 if more bytes follow, 0 if this is the last byte).
     * @param view The Uint8Array to read from.
     * @param offset The starting index in the array to read the varint from.
     * @returns An object containing the decoded integer value and the new offset after reading the varint.
     */
    public static readVarint(view: Uint8Array, offset: number): Varint.Result {
        let value = 0;
        let shift = 0;
        let pos = offset;

        while (true) {
            if (pos >= view.length) throw new VIOError(VIOError.Code.BUFFER_TOO_SHORT, 'Varint truncated');
            const byte = view[pos++];
            value |= (byte & 0x7F) << shift;
            if ((byte & 0x80) === 0) break;
            shift += 7;
            if (shift > 35) throw new VIOError(VIOError.Code.INVALID_DATA, 'Varint too large');
        }
        return { value, offset: pos };
    }
    /**
     * Encodes a number into a varint format (base-128 encoding) and returns it as a Uint8Array.
     * Varints are a compact way to encode integers, where smaller numbers take fewer bytes.
     * Each byte uses the lower 7 bits to store data and the highest bit as a continuation flag (1 if more bytes follow, 0 if this is the last byte).
     * @param value The number to encode as a varint. Must be a non-negative integer.
     * @returns A Uint8Array containing the varint-encoded bytes of the input number.
     */
    public static writeVarint(value: number): Uint8Array {
        if (value < 0) throw new VIOError(VIOError.Code.INVALID_DATA, 'Varint cannot be negative');
        const bytes: number[] = [];

        while (true) {
            let byte = value & 0x7F;
            value >>>= 7;
            if (value !== 0) { byte |= 0x80; }
            bytes.push(byte);
            if (value === 0) break;
        }
        return new Uint8Array(bytes);
    }
}
export namespace Varint {
    export interface Result {
        value: number;
        offset: number;
    }
}
export default Varint;
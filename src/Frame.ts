/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Implements the core Frame structure of the Vortez IO protocol, including encoding and decoding logic for binary frames.
 *              The Frame class provides static methods to encode and decode frames according to the protocol specification, handling various frame types, modes, and identifier formats.
 *              It also includes validation to ensure that frames adhere to the protocol rules regarding type and identifier combinations.
 *              This module is essential for constructing and interpreting the binary messages exchanged in the Vortez IO protocol.
 *              The Frame structure consists of a header byte that encodes the frame type and mode, followed by an optional identifier (which can be a UUID or a string), and the payload data.
 *              The encoding and decoding processes involve careful parsing of the header and identifier fields, as well as proper handling of the payload data to ensure compliance with the protocol.
 *              The Frame class also defines the various types, modes, and identifier formats supported by the protocol, along with utility methods for converting between different representations (e.g., UUID to binary).
 *              The implementation emphasizes robustness and error handling, throwing VIOError exceptions when encountering invalid input or protocol violations during encoding and decoding operations.
 *              This module is a critical component of the Vortez IO protocol implementation, enabling the construction and interpretation of the binary frames that form the basis of communication within the protocol.
 *              The Frame class is designed to be flexible and extensible, allowing for future additions of frame types, modes, and identifier formats as the protocol evolves.
 *              The encoding and decoding logic is optimized for performance while maintaining strict adherence to the protocol specification, ensuring efficient processing of frames in real-world applications.
 *              Overall, this module serves as the foundation for handling the binary communication aspects of the Vortez IO protocol, providing a clear and robust implementation of the Frame structure and its associated encoding and decoding mechanisms.
 * 
 *             ⚠️ IMPORTANT: This module assumes that the input data for decoding is well-formed according to the protocol specification.
 *              It performs basic validations but does not attempt to recover from malformed frames.
 *              Users of this module should ensure that they are providing valid input to avoid unexpected errors during decoding.
 * 
 * @see https://github.com/NetFeez/Vortez-IO-Protocol/blob/main/PROTOCOL.md for the full protocol specification and documentation.
 */
import UTF8Codec from "./support/UTF8Codec.js";
import UUID from "./support/UUID.js";
import Varint from "./support/Varint.js";
import VIOError from "./VIOError.js";

const MAX_ID_LENGTH = 1024;

export class Frame<T extends Frame.Type = Frame.Type> implements Frame.Frame<T> {
    protected static readonly TYPE_TO_BITS: Record<Frame.Type, number> = {
        RAW: 0x0, EVENT: 0x1, REQUEST: 0x2, RESPONSE: 0x3, ERROR: 0x4
    };
    protected static readonly TYPE_MAP: Record<number, Frame.Type> = {
        0x0: 'RAW', 0x1: 'EVENT', 0x2: 'REQUEST', 0x3: 'RESPONSE', 0x4: 'ERROR'
    };

    protected static readonly MODE_TO_BITS: Record<Frame.Mode, number> = {
        BINARY: 0x0, JSON: 0x1, LINE: 0x2, CUSTOM: 0x3
    };
    protected static readonly MODE_MAP: Record<number, Frame.Mode> = {
        0x0: 'BINARY', 0x1: 'JSON', 0x2: 'LINE', 0x3: 'CUSTOM'
    };

    protected static readonly ID_TYPE_TO_BITS: Record<Frame.IDType, number> = {
        NONE: 0x0, UUID: 0x1, STRING: 0x2
    };
    protected static readonly ID_TYPE_MAP: Record<number, Frame.IDType> = {
        0x0: 'NONE', 0x1: 'UUID', 0x2: 'STRING',
    };

    public constructor(
        public readonly type: T,
        public readonly mode: Frame.Mode,
        public readonly identifier: Frame.IdentifierMap[T],
        public readonly data: ArrayBuffer,
        public readonly reservedRaw: number
    ) {}
    /**
     * Decodes a binary frame from the given ArrayBuffer or Uint8Array according to the protocol specification.
     * The method parses the frame header to determine the type, mode, and identifier, and then extracts the payload data.
     * It performs various validations to ensure the frame adheres to the protocol rules, such as checking reserved bits and validating identifier types based on frame type.
     * @param buffer The input buffer containing the binary frame data to decode.
     * @returns A Frame object representing the decoded frame with its components (type, mode, identifier, data).
     * @throws VIOError if the buffer is too short, contains invalid header values, or violates protocol rules regarding type and identifier combinations.
     */
    public static decode(buffer: ArrayBuffer | Uint8Array): Frame.FrameUnion {
        const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

        if (view.length < 3) throw new VIOError(VIOError.Code.BUFFER_TOO_SHORT, 'Frame too short');

        const head = view[0];

        const typeBits = head & 0x0F;
        const modeBits = (head >> 4) & 0x0F;

        const type = this.assertDefined(this.TYPE_MAP[typeBits], VIOError.Code.INVALID_HEADER, `Invalid type: ${typeBits}`);
        const mode = this.assertDefined(this.MODE_MAP[modeBits], VIOError.Code.INVALID_HEADER, `Invalid mode: ${modeBits}`);

        const reserved = view[1];

        if (reserved !== 0) throw new VIOError(VIOError.Code.INVALID_HEADER, `Reserved byte must be 0 (got ${reserved})`);

        const idMeta = view[2];
        const idTypeBits = idMeta & 0x03;
        const idReservedBits = idMeta >> 2;

        if (idReservedBits !== 0) throw new VIOError(VIOError.Code.INVALID_HEADER, 'ID_META reserved bits must be 0');

        const idType = this.assertDefined(this.ID_TYPE_MAP[idTypeBits], VIOError.Code.INVALID_HEADER, `Invalid ID_TYPE: ${idTypeBits}`);

        let identifier: Frame.Identifier;
        let offset = 3;
        switch (idType) {
            case 'NONE':
                identifier = { type: 'NONE' };
                break;
            case 'UUID':
                if (view.length < offset + 16) throw new VIOError(VIOError.Code.BUFFER_TOO_SHORT, 'UUID missing');
                
                const raw = view.slice(offset, offset + 16);
                identifier = {
                    type: 'UUID',
                    id: UUID.binToUuid(raw),
                    idRaw: raw
                }
                offset += 16;
                break;
            case 'STRING': {
                const { value: len, offset: next } = Varint.readVarint(view, offset);
                if (len < 0 || len > MAX_ID_LENGTH) throw new VIOError(VIOError.Code.INVALID_HEADER, `Invalid String ID length: ${len}`);
                offset = next;

                if (view.length < offset + len) throw new VIOError(VIOError.Code.BUFFER_TOO_SHORT, 'String ID truncated');

                const raw = view.slice(offset, offset + len);
                identifier = {
                    type: 'STRING',
                    id: UTF8Codec.decode(raw),
                    idRaw: raw
                }

                offset += len;
                break;
            }
        }
        const data = this.toArrayBuffer(view.slice(offset));
        return this.assemble({ type, mode, identifier, data, reservedRaw: reserved });
    }
    /**
     * Assembles a Frame object from the given components, performing additional validation to ensure that the combination of type and identifier adheres to protocol rules.
     * This method is called after decoding the raw components of a frame to construct the final Frame object with proper typing and validation.
     * It checks that REQUEST and RESPONSE frames use UUID identifiers, EVENT frames use STRING identifiers, and ERROR frames can use either NONE or UUID identifiers.
     * If the components are valid, it returns a new Frame object; otherwise, it throws a VIOError indicating the specific protocol violation.
     * @param parts An object containing the decoded components of the frame (type, mode, identifier, data, reservedRaw) to be assembled into a Frame object.
     * @returns A Frame object representing the assembled frame with its components.
     * @throws VIOError if the combination of type and identifier is invalid according to protocol rules.
     */
    protected static assemble(parts: Frame.Frame): Frame.FrameUnion {
        const { type, mode, identifier, data, reservedRaw } = parts;
        let frame: Frame.FrameUnion;
        switch (type) {
            case 'REQUEST':
            case 'RESPONSE':
                if (identifier.type !== 'UUID') throw new VIOError(VIOError.Code.INVALID_HEADER, `${type} MUST use UUID`);
                frame = new Frame(type, mode, identifier, data, reservedRaw);
                break;
            case 'EVENT':
                if (identifier.type !== 'STRING') throw new VIOError(VIOError.Code.INVALID_HEADER, `EVENT MUST use STRING`);
                frame = new Frame(type, mode, identifier, data, reservedRaw);
                break;
            case 'ERROR':
                if (identifier.type !== 'NONE' && identifier.type !== 'UUID') throw new VIOError(VIOError.Code.INVALID_HEADER, `ERROR MUST use NONE or UUID`);
                frame = new Frame(type, mode, identifier, data, reservedRaw);
                break;
            case 'RAW':
                frame = new Frame(type, mode, identifier, data, reservedRaw);
                break;
        }
        return frame;
    }
    /**
     * Encodes the given frame components into a binary format according to the protocol specification.
     * The resulting ArrayBuffer will contain the frame header followed by the identifier (if applicable) and the payload data.
     * @param type The type of the frame (e.g., 'REQUEST', 'RESPONSE', etc.).
     * @param mode The mode of the frame (e.g., 'BINARY', 'JSON', etc.).
     * @param data The payload data to include in the frame, as an ArrayBuffer or Uint8Array.
     * @param identifier An optional identifier for the frame, which can be of type NONE, UUID, or STRING. Defaults to NONE if not provided.
     * @returns An ArrayBuffer containing the encoded frame ready for transmission.
     * @throws VIOError if the provided type, mode, or identifier combination is invalid according to the protocol rules.
     */
    public static encode(type: 'RAW', mode: Frame.Mode, data: ArrayBuffer | Uint8Array, identifier?: Frame.IdentifierMap['RAW']): ArrayBuffer;
    public static encode(type: 'EVENT', mode: Frame.Mode, data: ArrayBuffer | Uint8Array, identifier: Frame.IdentifierMap['EVENT']): ArrayBuffer;
    public static encode(type: 'REQUEST', mode: Frame.Mode, data: ArrayBuffer | Uint8Array, identifier: Frame.IdentifierMap['REQUEST']): ArrayBuffer;
    public static encode(type: 'RESPONSE', mode: Frame.Mode, data: ArrayBuffer | Uint8Array, identifier: Frame.IdentifierMap['RESPONSE']): ArrayBuffer;
    public static encode(type: 'ERROR', mode: Frame.Mode, data: ArrayBuffer | Uint8Array, identifier?: Frame.IdentifierMap['ERROR']): ArrayBuffer;
    public static encode(type: Frame.Type, mode: Frame.Mode, data: ArrayBuffer | Uint8Array, identifier: Frame.Identifier = { type: 'NONE' }): ArrayBuffer {
        const typeBits = this.assertDefined(this.TYPE_TO_BITS[type], VIOError.Code.UNKNOWN_TYPE, `Unknown type: ${type}`);

        const modeBits = this.assertDefined(this.MODE_TO_BITS[mode], VIOError.Code.UNKNOWN_MODE, `Unknown mode: ${mode}`);

        const idTypeBits = this.assertDefined(this.ID_TYPE_TO_BITS[identifier.type], VIOError.Code.INVALID_HEADER, `Unknown ID_TYPE: ${identifier.type}`);

        this.validate(type, identifier.type);

        let idBytes: Uint8Array = new Uint8Array(0);

        if (identifier.type === 'UUID') {
            if (!UUID.isValid(identifier.id)) throw new VIOError(VIOError.Code.INVALID_HEADER, `Invalid UUID: ${identifier.id}`);
            idBytes = UUID.uuidToBin(identifier.id);
        }

        else if (identifier.type === 'STRING') {
            const encoded = UTF8Codec.encode(identifier.id);
            const varint = Varint.writeVarint(encoded.length);

            if (encoded.length > MAX_ID_LENGTH) throw new VIOError(VIOError.Code.INVALID_HEADER, `String ID too long (max ${MAX_ID_LENGTH} bytes)`);

            idBytes = new Uint8Array(varint.length + encoded.length);
            idBytes.set(varint, 0);
            idBytes.set(encoded, varint.length);
        }

        const payload = data instanceof Uint8Array ? data : new Uint8Array(data);

        const totalLength = 3 + idBytes.length + payload.length;
        const buffer = new Uint8Array(totalLength);

        buffer[0] = (modeBits << 4) | typeBits;
        buffer[1] = 0;
        buffer[2] = idTypeBits & 0x03;

        let offset = 3;

        buffer.set(idBytes, offset);
        offset += idBytes.length;

        buffer.set(payload, offset);

        return this.toArrayBuffer(buffer);
    }
    /**
     * Validates the combination of frame type and identifier type according to protocol rules:
     * - REQUEST and RESPONSE frames MUST use UUID identifiers.
     * - EVENT frames MUST NOT use UUID identifiers (they can use STRING or NONE).
     * - ERROR and RAW frames have no restrictions on identifier type.
     * @param type The frame type to validate.
     * @param idType The identifier type to validate against the frame type.
     * @throws VIOError if the combination of type and idType is invalid according to the protocol rules.
     */
    protected static validate(type: Frame.Type, idType: Frame.IDType) {
        switch (type) {
            case 'REQUEST':
            case 'RESPONSE':
                if (idType !== 'UUID') throw new VIOError(VIOError.Code.INVALID_HEADER, `${type} MUST use UUID`);
                break;
            case 'EVENT':
                if (idType !== 'STRING') throw new VIOError(VIOError.Code.INVALID_HEADER, `EVENT MUST use STRING`);
                break;
            case 'ERROR': break;
            case 'RAW': break;
        }
    }
    /**
     * Creates a copy of the ArrayBuffer from a Uint8Array view, ensuring it is not a shared buffer.
     * This is necessary because the input Uint8Array may be a view into a larger buffer, and we want to ensure that the Frame's data is isolated and immutable.
     * @param view The Uint8Array view to convert into an ArrayBuffer.
     * @returns A new ArrayBuffer containing the data from the view.
     */
    protected static toArrayBuffer(view: Uint8Array): ArrayBuffer {
        const out = new Uint8Array(view.byteLength);
        out.set(view);
        return out.buffer;
    }
    /**
     * Utility method to assert that a value is defined (not undefined) and throw a VIOError with the provided message if it is not.
     * This is used to ensure that required values are present during decoding and validation processes.
     * @param value The value to check for being defined.
     * @param code The VIOError code to use if the value is undefined.
     * @param msg The error message to include in the VIOError if the value is undefined.
     * @returns The input value if it is defined, otherwise throws a VIOError.
     * @throws VIOError if the value is undefined, with the provided message.
     */
    protected static assertDefined<T>(value: T | undefined, code: VIOError.Code, msg: string): T {
        if (value === undefined ) throw new VIOError(code, msg);
        return value;
    }
}
export namespace Frame {
    export type Type = 'RAW' | 'EVENT' | 'REQUEST' | 'RESPONSE' | 'ERROR';
    export type Mode = 'BINARY' | 'JSON' | 'LINE' | 'CUSTOM';
    export type IDType = 'NONE' | 'UUID' | 'STRING';

    export namespace Identifier {
        export interface Base {
            type: IDType;
        }
        export interface None extends Base {
            type: 'NONE';
        }
        export interface UUID extends Base {
            type: 'UUID';
            id: string;
            idRaw?: Uint8Array;
        }
        export interface String extends Base {
            type: 'STRING';
            id: string;
            idRaw?: Uint8Array;
        }
    }
    export type Identifier = Identifier.None | Identifier.UUID | Identifier.String;
    export interface IdentifierMap {
        RAW: Identifier.None | Identifier.UUID | Identifier.String;
        EVENT: Identifier.String;
        REQUEST: Identifier.UUID;
        RESPONSE: Identifier.UUID;
        ERROR: Identifier.None | Identifier.UUID;
    }
    export interface Frame<T extends Type = Type> {
        type: T;
        mode: Mode;
        identifier: IdentifierMap[T];
        data: ArrayBuffer;
        reservedRaw: number;
    }
    export type FrameUnion = {
        [K in Type]: Frame<K>
    }[Type];
}
export default Frame;
/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description UTF-8 encoder and decoder with replacement-character handling.
 */
export class UTF8Codec {
    private static readonly REPLACEMENT_CHAR = '\uFFFD';
    /**
     * Encodes a string into a UTF-8 byte array.
     * @param text The string to encode.
     * @returns A Uint8Array containing the UTF-8 encoded bytes of the input string.
     */
    public static encode(text: string): Uint8Array {
        const len = text.length;
        let byteLength = 0;

        for (let i = 0; i < len; i++) {
            const code = text.charCodeAt(i);

            if (code < 0x80) { byteLength += 1; }
            else if (code < 0x800) { byteLength += 2; }
            else if (code >= 0xd800 && code <= 0xdbff) {
                const next = i + 1 < len ? text.charCodeAt(i + 1) : 0;

                if (next >= 0xdc00 && next <= 0xdfff) {
                    byteLength += 4;
                    i++;
                } else { byteLength += 3; }
            } else { byteLength += 3; }
        }
        const out = new Uint8Array(byteLength);
        let offset = 0;

        for (let i = 0; i < len; i++) {
            const code = text.charCodeAt(i);
            if (code < 0x80) {
                out[offset++] = code;
                continue;
            }
            if (code < 0x800) {
                out[offset++] = 0xc0 | (code >> 6);
                out[offset++] = 0x80 | (code & 0x3f);
                continue;
            }
            if (code >= 0xd800 && code <= 0xdbff) {
                const next = i + 1 < len ? text.charCodeAt(i + 1) : 0;

                if (next >= 0xdc00 && next <= 0xdfff) {
                    const cp = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff);

                    out[offset++] = 0xf0 | (cp >> 18);
                    out[offset++] = 0x80 | ((cp >> 12) & 0x3f);
                    out[offset++] = 0x80 | ((cp >> 6) & 0x3f);
                    out[offset++] = 0x80 | (cp & 0x3f);

                    i++;
                    continue;
                }
                offset = this.writeReplacement(out, offset);
                continue;
            }
            out[offset++] = 0xe0 | (code >> 12);
            out[offset++] = 0x80 | ((code >> 6) & 0x3f);
            out[offset++] = 0x80 | (code & 0x3f);
        }

        return out;
    }
    /**
     * Decodes a UTF-8 byte array into a string. Malformed sequences are replaced with the Unicode replacement character (U+FFFD).
     * @param bytes The Uint8Array containing the UTF-8 encoded bytes to decode.
     * @returns The decoded string, with any malformed sequences replaced by U+FFFD.
     */
    public static decode(bytes: Uint8Array): string {
        let out = '';
        let i = 0;
        const len = bytes.length;

        while (i < len) {
            const b1 = bytes[i++];
            if (b1 < 0x80) {
                out += String.fromCharCode(b1);
                continue;
            }
            if ((b1 & 0xe0) === 0xc0) {
                if (i >= len) {
                    out += this.REPLACEMENT_CHAR;
                    break;
                }

                const b2 = bytes[i++];

                if ((b2 & 0xc0) !== 0x80) {
                    out += this.REPLACEMENT_CHAR;
                    continue;
                }

                const code = ((b1 & 0x1f) << 6) | (b2 & 0x3f);
                out += String.fromCharCode(code);
                continue;
            }
            if ((b1 & 0xf0) === 0xe0) {
                if (i + 1 >= len) {
                    out += this.REPLACEMENT_CHAR;
                    break;
                }

                const b2 = bytes[i++];
                const b3 = bytes[i++];

                if ((b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) {
                    out += this.REPLACEMENT_CHAR;
                    continue;
                }

                const code = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);

                out += String.fromCharCode(code);
                continue;
            }
            if ((b1 & 0xf8) === 0xf0) {
                if (i + 2 >= len) {
                    out += this.REPLACEMENT_CHAR;
                    break;
                }

                const b2 = bytes[i++];
                const b3 = bytes[i++];
                const b4 = bytes[i++];

                if ((b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80 || (b4 & 0xc0) !== 0x80) {
                    out += this.REPLACEMENT_CHAR;
                    continue;
                }

                const cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);

                out += String.fromCodePoint(cp);
                continue;
            }
            out += this.REPLACEMENT_CHAR;
        }

        return out;
    }
    /**
     * Writes the UTF-8 encoding of the replacement character (U+FFFD) to the output buffer at the specified offset.
     * @param out The output buffer to write to.
     * @param offset The offset in the buffer where the replacement character should be written.
     * @returns The new offset after writing the replacement character.
     */
    protected static writeReplacement(out: Uint8Array, offset: number): number {
        out[offset++] = 0xef;
        out[offset++] = 0xbf;
        out[offset++] = 0xbd;
        return offset;
    }
}

export default UTF8Codec;
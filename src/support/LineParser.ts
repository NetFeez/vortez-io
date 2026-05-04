/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gemail.com>
 * @license Apache-2.0
 * @description Provides encoding and decoding functionality for line-based content used in the Vortez IO protocol.
 *              The LineCodec class allows for converting between a ContentMap (a mapping of string keys to string values) and a line-based text format where each key-value pair is represented as a block of text with specific formatting rules.
 *              This is useful for encoding structured data in a human-readable format that can be easily transmitted and parsed within the Vortez IO protocol.
 */
import UTF8Codec from "./UTF8Codec.js";

export class LineCodec {
    /**
     * Encodes a ContentMap into a Uint8Array containing line-based content.
     * Each key-value pair in the ContentMap is converted into a block of text where the key is on the first line, followed by the value on subsequent lines. 
     * Lines are separated by \r\n, and key-value pairs are separated by \r\n\r\n.
     * If a value contains multiple lines, each subsequent line after the first will start with a space character to indicate that it is a continuation of the previous line.
     * @param data A ContentMap object where each key is a string and each value is the corresponding string value to be encoded.
     * @returns A Uint8Array containing the UTF-8 encoded line-based content representing the input ContentMap.
     */
    public static encode(data: LineCodec.ContentMap): Uint8Array {
        let content = '';
        for (const [key, value] of Object.entries(data)) {
            const valueProcessed = value.replace(/\r\n/g, '\r\n ');
            content += `${key}\r\n${valueProcessed}\r\n\r\n`;
        }
        return UTF8Codec.encode(content);
    }
    /**
     * Decodes a Uint8Array containing line-based content into a ContentMap.
     * The input is expected to be UTF-8 encoded and formatted with lines separated by \r\n, and key-value pairs separated by \r\n\r\n.
     * Values that span multiple lines should have subsequent lines starting with a space character.
     * @param content A Uint8Array containing the UTF-8 encoded line-based content.
     * @returns A ContentMap object where each key is a string and each value is the corresponding string value from the input, with multi-line values properly concatenated.
     */
    public static decode(content: ArrayBuffer | Uint8Array): LineCodec.ContentMap {
        const view = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
        const decodedContent = UTF8Codec.decode(view);
        const lines = decodedContent.split('\r\n\r\n');
        const result: LineCodec.ContentMap = {};
        
        for (const line of lines) {
            const [key, ...valueParts] = line.split('\r\n');
            if (!key) continue;
            const value = valueParts.join('\r\n').replace(/\r\n /g, '\r\n');
            result[key] = value;
        }
        return result;
    }
}
export namespace LineCodec {
    export interface ContentMap {
        [key: string]: string;
    }
}
export default LineCodec;
/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Core transport-agnostic API for sending and receiving VIO frames.
 */
import { Events } from "@netfeez/common";

import RequestManager from "./RequestManager.js";
import VIOError from "./VIOError.js";
import Frame from "./Frame.js";
import UTF8Codec from "./support/UTF8Codec.js";
import LineCodec from "./support/LineParser.js";

import type Isomorphic from "./support/Isomorphic.js";

export class VIO<TimeoutType extends any> extends Events<VIO.EventMap> {
    protected mRequest: RequestManager<TimeoutType>;
    public vTransport: Events.Emitter<VIO.TransportEventMap>;

    public constructor(dependencies: Isomorphic.DependencyList<TimeoutType>) {super();
        this.mRequest = new RequestManager(dependencies);
        this.mRequest.on('error', (error) => this.emit('error', error));
        this.mRequest.on('send', this.sendRequest.bind(this));
        this.vTransport = new Events.Emitter();
    }
    /**
     * The transport emitter allows you to send raw frames and listen for transport-level events like errors.
     * Use the `request`, `event`, and `raw` methods for higher-level interactions that automatically handle framing and serialization.
     */
    public get transport(): Events<VIO.TransportEventMap> { return this.vTransport; }
    /**
     * Sends a request and returns a promise that resolves with the response or rejects with an error.
     * @param data The data to send in the request. This can be a Uint8Array, ArrayBuffer, or any JSON-serializable object. If you want to send line-based data, pass an object and specify mode: 'LINE'.
     * @param options Optional settings for the request, such as timeout duration. The exact options depend on the implementation of the RequestManager.
     * @returns A promise that resolves with the response data or rejects with a VIOError if the request fails or times out.
     * @throws {VIOError} Throws a VIOError if the request fails or if there is an error in processing the response. Make sure to catch these errors when using the `request` method to handle them gracefully in your application.
     */
    public async request(data: any, options?: RequestManager.SendOptions): Promise<RequestManager.Response> {
        return this.mRequest.send(data, options);
    }
    /**
     * Emits an event with the specified name and data.
     * The data can be a Uint8Array, ArrayBuffer, or any JSON-serializable object.
     * If you want to send line-based data, pass an object and specify mode: 'LINE'.
     * The event will be framed and sent over the transport.
     * Make sure to handle any errors that may occur during the sending process by listening to the 'error' event on the transport emitter.
     * @param name The name of the event to emit. This should be a string that identifies the event type.
     * @param data The data to send with the event. This can be a Uint8Array, ArrayBuffer, or any JSON-serializable object. If you want to send line-based data, pass an object and specify mode: 'LINE'.
     * @throws {VIOError} Throws a VIOError if there is an error in sending the event. Make sure to catch these errors by listening to the 'error' event on the transport emitter to handle them gracefully in your application.
     */
    public event(name: string, data: any): void {
        this.sendEvent(name, data);
    }
    /**
     * Sends raw binary data as a frame of type 'RAW'.
     * This method is for advanced use cases where you want to send data without the overhead of framing it as an event or request.
     * The data will be sent as-is, and it's up to the receiving end to interpret it correctly.
     * Make sure to handle any errors that may occur during the sending process by listening to the 'error' event on the transport emitter.
     * @param data The raw binary data to send. This can be a Uint8Array or an ArrayBuffer.
     * @throws {VIOError} Throws a VIOError if there is an error in sending the raw data. Make sure to catch these errors by listening to the 'error' event on the transport emitter to handle them gracefully in your application.
     */
    public raw(data: ArrayBuffer | Uint8Array): void {
        const frame = Frame.encode('RAW', 'BINARY', new Uint8Array(data));
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'RAW', info: {} }); }
    }
    /**
     * Handles incoming data by decoding it into a frame and processing it based on the frame type.
     * This method should be called whenever new data is received from the transport.
     * It will emit higher-level events like 'event', 'request', and 'response' based on the content of the frame.
     * Make sure to handle any errors that may occur during the decoding and processing of the frame by listening to the 'error' event on this VIO instance.
     * @param data The incoming data to handle. This can be a Uint8Array or an ArrayBuffer containing the raw frame data.
     * @throws {VIOError} Throws a VIOError if there is an error in decoding or processing the frame. Make sure to catch these errors by listening to the 'error' event on this VIO instance to handle them gracefully in your application.
     */
    public handle(data: ArrayBuffer | Uint8Array): void {
        try {
            const frame = Frame.decode(data);
            switch (frame.type) {
                case 'RAW': this.handleRaw(frame); break;
                case 'EVENT': this.handleEvent(frame); break;
                case 'REQUEST': this.handleRequest(frame); break;
                case 'RESPONSE': this.handleResponse(frame); break;
                case 'ERROR': this.handleError(frame); break;
                default: this.sendError(new VIOError(VIOError.Code.INVALID_DATA, 'Unknown frame type')); break;
            }
        } catch (error) {
            this.emit('error', error instanceof VIOError ? error : new VIOError(VIOError.Code.INVALID_DATA, 'Failed to decode frame'));
        }
    }
    /**
     * Handles a raw frame by emitting it as a 'raw' event. This allows users of the VIO class to listen for raw frames directly if they need to process them in a custom way.
     * @param frame The raw frame to handle. This frame will be emitted as-is without any additional processing, so make sure to handle it appropriately in your event listeners.
     * @throws {VIOError} Throws a VIOError if there is an error in processing the raw frame. Make sure to catch these errors by listening to the 'error' event on this VIO instance to handle them gracefully in your application.
     */
    protected async handleRaw(frame: Frame<'RAW'>): Promise<void> {
        this.emit('raw', frame);
    }
    /**
     * Handles an event frame by decoding its content based on the specified mode and emitting it as an 'event' with the appropriate data.
     * The event will include the name (identifier), mode, and decoded data.
     * Make sure to handle any errors that may occur during the decoding process by listening to the 'error' event on this VIO instance.
     * @param frame The event frame to handle. This frame should contain a valid identifier and data that can be decoded according to the specified mode.
     * @throws {VIOError} Throws a VIOError if there is an error in decoding the event data or if the frame has an unknown mode. Make sure to catch these errors by listening to the 'error' event on this VIO instance to handle them gracefully in your application.
     */
    protected async handleEvent(frame: Frame<'EVENT'>): Promise<void> {
        try {
            if (frame.mode == 'BINARY' || frame.mode == 'CUSTOM') {
                const data = new Uint8Array(frame.data);
                this.emit('event', frame.identifier.id, frame.mode, data);
            } else if (frame.mode == 'JSON') {
                const json = UTF8Codec.decode(new Uint8Array(frame.data));
                const data = JSON.parse(json);
                this.emit('event', frame.identifier.id, frame.mode, data);
            } else if (frame.mode == 'LINE') {
                const data = LineCodec.decode(frame.data);
                this.emit('event', frame.identifier.id, frame.mode, data);
            } else this.sendError(new VIOError(VIOError.Code.UNKNOWN_MODE, `Unknown mode: ${frame.mode}`));
        } catch (error) { this.emit('error', error instanceof VIOError ? error : new VIOError(VIOError.Code.INVALID_DATA, 'Failed to process event data')); }
    }
    /**
     * Handles a request frame by decoding its content based on the specified mode and emitting it as a 'request' with the appropriate data and callback functions for handling the response.
     * The request will include the mode, decoded data, and two callback functions: `done` for sending a successful response and `fail` for sending an error response.
     * Make sure to handle any errors that may occur during the decoding process by listening to the 'error' event on this VIO instance.
     * @param frame The request frame to handle. This frame should contain a valid identifier and data that can be decoded according to the specified mode.
     * @throws {VIOError} Throws a VIOError if there is an error in decoding the request data, if the frame has an unknown mode, or if the request frame is missing a UUID. Make sure to catch these errors by listening to the 'error' event on this VIO instance to handle them gracefully in your application.
     */
    protected async handleRequest(frame: Frame<'REQUEST'>): Promise<void> {
        if (!frame.identifier.id) return this.sendError(new VIOError(VIOError.Code.INVALID_HEADER, 'Request frame missing UUID'));
        const uuid = frame.identifier.id;
        try {
            if (frame.mode == 'BINARY' || frame.mode == 'CUSTOM') {
                const data = new Uint8Array(frame.data);
                const done = (data: Uint8Array) => this.sendResponse(uuid, data);
                const fail = (error: VIOError) => this.sendError(error, uuid);
                this.emit('request', frame.mode, data, done, fail);
            } else if (frame.mode == 'JSON') {
                const json = UTF8Codec.decode(new Uint8Array(frame.data));
                const data = JSON.parse(json);
                const done = (data: any) => this.sendResponse(uuid, data);
                const fail = (error: VIOError) => this.sendError(error, uuid);
                this.emit('request', frame.mode, data, done, fail);
            } else if (frame.mode == 'LINE') {
                const data = LineCodec.decode(frame.data);
                const done = (data: Record<string, string>) => this.sendResponse(uuid, data);
                const fail = (error: VIOError) => this.sendError(error, uuid);
                this.emit('request', frame.mode, data, done, fail);
            } else this.sendError(new VIOError(VIOError.Code.UNKNOWN_MODE, `Unknown mode: ${frame.mode}`), uuid);
        } catch (error) { this.sendError(new VIOError(VIOError.Code.INVALID_DATA, 'Failed to process request data'), uuid); }
    }
    /**
     * Handles a response frame by decoding its content based on the specified mode and passing it to the RequestManager to resolve the corresponding request promise.
     * The response will be matched to the original request using the UUID from the frame identifier.
     * Make sure to handle any errors that may occur during the decoding process by listening to the 'error' event on this VIO instance.
     * @param frame The response frame to handle. This frame should contain a valid UUID in the identifier and data that can be decoded according to the specified mode.
     * @throws {VIOError} Throws a VIOError if there is an error in decoding the response data, if the frame has an unknown mode, or if the response frame is missing a UUID. Make sure to catch these errors by listening to the 'error' event on this VIO instance to handle them gracefully in your application.
     */
    protected async handleResponse(frame: Frame<'RESPONSE'>): Promise<void> {
        if (!frame.identifier.id) return this.sendError(new VIOError(VIOError.Code.INVALID_HEADER, 'Response frame missing UUID'));
        try {
            if (frame.mode == 'BINARY' || frame.mode == 'CUSTOM') {
                const data = new Uint8Array(frame.data);
                this.mRequest.handle(frame.identifier.id, { mode: frame.mode, data });
            } else if (frame.mode == 'JSON') {
                const json = UTF8Codec.decode(new Uint8Array(frame.data));
                const data = JSON.parse(json);
                this.mRequest.handle(frame.identifier.id, { mode: 'JSON', data });
            } else if (frame.mode == 'LINE') {
                const data = LineCodec.decode(frame.data);
                this.mRequest.handle(frame.identifier.id, { mode: 'LINE', data });
            } else this.mRequest.handle(frame.identifier.id, undefined, new VIOError(VIOError.Code.UNKNOWN_MODE, `Unknown mode: ${frame.mode}`));
        } catch (error) { this.mRequest.handle(frame.identifier.id, undefined, new VIOError(VIOError.Code.INVALID_DATA, 'Failed to process response data')); }
    }
    /**
     * Handles an error frame by decoding its content based on the specified mode and passing the error information to the RequestManager or emitting it as an 'error' event if the frame does not have a valid identifier.
     * The error will be matched to the original request using the UUID from the frame identifier if available. If the identifier type is 'NONE', the error will be emitted as a general 'error' event.
     * Make sure to handle any errors that may occur during the decoding process by listening to the 'error' event on this VIO instance.
     * @param frame The error frame to handle. This frame should contain data that can be decoded according to the specified mode, and may optionally contain a UUID in the identifier for matching it to a request.
     * @throws {VIOError} Throws a VIOError if there is an error in decoding the error data or if the frame has an unknown mode. Make sure to catch these errors by listening to the 'error' event on this VIO instance to handle them gracefully in your application.
     */
    protected async handleError(frame: Frame<'ERROR'>): Promise<void> {
        try {
            if (frame.identifier.type === 'NONE') {
                const error = new VIOError(VIOError.Code.INVALID_DATA, 'Unknown error');
                return this.emit('error', error);
            }
            if (frame.mode == 'BINARY' || frame.mode == 'CUSTOM') {
                const data = new Uint8Array(frame.data);
                const error = new VIOError(VIOError.Code.INVALID_DATA, `Error response with binary data: ${data.length} bytes`);
                this.mRequest.handle(frame.identifier.id, undefined, error);
            } else if (frame.mode == 'JSON') {
                const json = UTF8Codec.decode(new Uint8Array(frame.data));
                const data = JSON.parse(json);
                const error = new VIOError(VIOError.Code.INVALID_DATA, data.error || 'Unknown error');
                this.mRequest.handle(frame.identifier.id, undefined, error);
            } else if (frame.mode == 'LINE') {
                const data = LineCodec.decode(frame.data);
                const error = new VIOError(VIOError.Code.INVALID_DATA, `Error response with line data: ${JSON.stringify(data)}`);
                this.mRequest.handle(frame.identifier.id, undefined, error);
            } else {
                const error = new VIOError(VIOError.Code.UNKNOWN_MODE, `Unknown mode: ${frame.mode}`);
                this.mRequest.handle(frame.identifier.id, undefined, error);
            }
        } catch (error) {
            const vioError = new VIOError(VIOError.Code.INVALID_DATA, 'Failed to process error data');
            if (frame.identifier.type === 'UUID') this.mRequest.handle(frame.identifier.id, undefined, vioError);
            this.emit('error', vioError);
        }
    }
    /**
     * Sends an event frame with the specified name and data, encoding the data according to the specified mode (BINARY, JSON, or LINE).
     * The event will be framed and sent over the transport.
     * Make sure to handle any errors that may occur during the sending process by listening to the 'error' event on the transport emitter.
     * @param name The name of the event to emit. This should be a string that identifies the event type.
     * @param data The data to send with the event. This can be a Uint8Array, ArrayBuffer, or any JSON-serializable object. If you want to send line-based data, pass an object and specify mode: 'LINE'.
     * @param mode Optional mode for encoding the data. If not specified, the method will automatically determine the mode based on the type of data provided (BINARY for Uint8Array/ArrayBuffer, JSON for objects, LINE for line-based data).
     * @throws {VIOError} Throws a VIOError if there is an error in sending the event. Make sure to catch these errors by listening
     */
    protected sendEvent(name: string, data: Uint8Array | ArrayBuffer): void;
    protected sendEvent(name: string, data: LineCodec.ContentMap, mode: 'LINE'): void;
    protected sendEvent(name: string, data: any): void;
    protected sendEvent(name: string, data: any, mode?: 'LINE'): void {
        const { content, finalMode } = this.serialize(data, mode);
        const frame = Frame.encode('EVENT', finalMode, content, { type: 'STRING', id: name });
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'EVENT', info: { name } }); }
    }
    /**
     * Sends a request frame with the specified UUID and data, encoding the data according to the specified mode (BINARY, JSON, or LINE).
     * The request will be framed and sent over the transport, and the UUID will be used to match the response to the original request.
     * Make sure to handle any errors that may occur during the sending process by listening to the 'error' event on the transport emitter.
     * @param uuid The UUID to associate with this request. This should be a unique identifier that can be used to match the response to this request.
     * @param data The data to send with the request. This can be a Uint8Array, ArrayBuffer, or any JSON-serializable object. If you want to send line-based data, pass an object and specify mode: 'LINE'.
     * @param mode Optional mode for encoding the data. If not specified, the method will automatically determine the mode based on the type of data provided (BINARY for Uint8Array/ArrayBuffer, JSON for objects, LINE for line-based data).
     * @throws {VIOError} Throws a VIOError if there is an error in sending the request. Make sure to catch these errors by listening to the 'error' event on the transport emitter to handle them gracefully in your application.
     */
    protected sendRequest(uuid: string, data: Uint8Array | ArrayBuffer): void;
    protected sendRequest(uuid: string, data: LineCodec.ContentMap, mode: 'LINE'): void;
    protected sendRequest(uuid: string, data: any): void;
    protected sendRequest(uuid: string, data?: any, mode?: 'LINE'): void {
        const { content, finalMode } = this.serialize(data, mode);
        const frame = Frame.encode('REQUEST', finalMode, content, { type: 'UUID', id: uuid });
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'REQUEST', uuid, info: {} }); }
    }
    /**
     * Sends a response frame with the specified UUID and data, encoding the data according to the specified mode (BINARY, JSON, or LINE).
     * The response will be framed and sent over the transport, and the UUID will be used to match it to the original request.
     * Make sure to handle any errors that may occur during the sending process by listening to the 'error' event on the transport emitter.
     * @param uuid The UUID to associate with this response. This should match the UUID of the original request that this response is for.
     * @param data The data to send with the response. This can be a Uint8Array, ArrayBuffer, or any JSON-serializable object. If you want to send line-based data, pass an object and specify mode: 'LINE'.
     * @param mode Optional mode for encoding the data. If not specified, the method will automatically determine the mode based on the type of data provided (BINARY for Uint8Array/ArrayBuffer, JSON for objects, LINE for line-based data).
     * @throws {VIOError} Throws a VIOError if there is an error in sending the response. Make sure to catch these errors by listening to the 'error' event on the transport emitter to handle them gracefully in your application.
     */
    protected sendResponse(uuid: string, data: Uint8Array | ArrayBuffer): void;
    protected sendResponse(uuid: string, data: LineCodec.ContentMap, mode: 'LINE'): void;
    protected sendResponse(uuid: string, data: any): void;
    protected sendResponse(uuid: string, data?: any, mode?: 'LINE'): void {
        const { content, finalMode } = this.serialize(data, mode);
        const frame = Frame.encode('RESPONSE', finalMode, content, { type: 'UUID', id: uuid });
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'RESPONSE', uuid, info: {} }); }
    }
    /**
     * Sends an error frame with the specified UUID and error information, encoding the error data according to the specified mode (BINARY, JSON, or LINE).
     * The error will be framed and sent over the transport, and the UUID will be used to match it to the original request if applicable.
     * If the UUID is not provided, the error will be sent without an identifier, and it's up to the receiving end to interpret it as a general error.
     * Make sure to handle any errors that may occur during the sending process by listening to the 'error' event on the transport emitter.
     * @param error The VIOError object containing the error information to send.
     * @param uuid Optional UUID to associate with this error. If provided, this should match the UUID of the original request that this error is for. If not provided, the error will be sent without an identifier.
     * @param mode Optional mode for encoding the error data. If not specified, the method will automatically determine the mode based on the type of data in the VIOError (BINARY for Uint8Array/ArrayBuffer, JSON for objects, LINE for line-based data).
     * @throws {VIOError} Throws a VIOError if there is an error in sending the error frame. Make sure to catch these errors by listening to the 'error' event on the transport emitter to handle them gracefully in your application.
     */
    protected sendError(error: VIOError, uuid?: string): void {
        const json = JSON.stringify({ error: error.message, code: error.code });
        const content = UTF8Codec.encode(json);
        const frame = Frame.encode('ERROR', 'JSON', content, uuid ? { type: 'UUID', id: uuid } : { type: 'NONE' });
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'ERROR', uuid, info: {} }); }
    }
    /**
     * Serializes the given data into a Uint8Array based on the specified mode. If the data is already a Uint8Array or ArrayBuffer, it will be returned as-is with the appropriate mode. If the mode is 'LINE', the data will be encoded using the LineCodec. For other objects, the data will be JSON-stringified and encoded as UTF-8.
     * @param data The data to serialize. This can be a Uint8Array, ArrayBuffer, or any JSON-serializable object. If you want to send line-based data, pass an object and specify mode: 'LINE'.
     * @param mode Optional mode for encoding the data. If not specified, the method will automatically determine the mode based on the type of data provided (BINARY for Uint8Array/ArrayBuffer, JSON for objects, LINE for line-based data).
     * @returns An object containing the serialized content as a Uint8Array and the final mode used for encoding.
     */
    protected serialize(data: any, mode?: 'LINE'): { content: Uint8Array, finalMode: Frame.Mode } {
        if (data instanceof Uint8Array) return { content: data, finalMode: 'BINARY' };
        if (data instanceof ArrayBuffer) return { content: new Uint8Array(data), finalMode: 'BINARY' };
        if (mode === 'LINE') return { content: LineCodec.encode(data), finalMode: 'LINE' };
        const json = JSON.stringify(data ?? {});
        return { content: UTF8Codec.encode(json), finalMode: 'JSON' };
    }
}
export namespace VIO {
    export interface ErrorContext {
        stage: 'send' | 'recv' | 'connect';
        frameType?: Frame.Type | string;
        uuid?: string;
        info?: any;
    }
    export type TransportEventMap = {
        send: [data: ArrayBuffer];
        'error': [err: Error, context: ErrorContext];
    }

    type EventTuple = (
        [name: string, type: 'BINARY' | 'CUSTOM', data: Uint8Array] |
        [name: string, type: 'JSON', data: any] |
        [name: string, type: 'LINE', data: Record<string, string>]
    );
    type requestTuple = (
        [type: 'BINARY' | 'CUSTOM', data: Uint8Array, done: RequestManager.Done<Uint8Array>, fail: RequestManager.Fail] |
        [type: 'JSON', data: any, done: RequestManager.Done<any>, fail: RequestManager.Fail] |
        [type: 'LINE', data: Record<string, string>, done: RequestManager.Done<Record<string, string>>, fail: RequestManager.Fail]
    );
    export type EventMap = {
        request: requestTuple;
        event: EventTuple;
        error: [error: VIOError];
        raw: [data: Frame<'RAW'>];
        response: [uuid: string, response: RequestManager.Response];
    }
}
export default VIO;
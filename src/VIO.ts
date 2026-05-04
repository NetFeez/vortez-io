import { Events } from "@netfeez/common";

import RequestManager from "./RequestManager.js";
import VIOError from "./VIOError.js";
import Frame from "./Frame.js";
import UTF8Codec from "./support/UTF8Codec.js";
import LineCodec from "./support/LineParser.js";

export class VIO<T extends any> extends Events<VIO.EventMap> {
    protected mRequest: RequestManager<T>;
    public vTransport: Events.Emitter<VIO.TransportEventMap>;

    public constructor(dependencies: RequestManager.DEPENDENCIES<T>) {super();
        this.mRequest = new RequestManager(dependencies);
        this.mRequest.on('error', (error) => this.emit('error', error));
        this.mRequest.on('send', this.sendRequest.bind(this));
        this.vTransport = new Events.Emitter();
    }
    public get transport(): Events<VIO.TransportEventMap> { return this.vTransport; }
    public async request(data: any, options?: RequestManager.SendOptions): Promise<RequestManager.Response> {
        return this.mRequest.send(data, options);
    }
    public event(name: string, data: any): void {
        this.sendEvent(name, data);
    }
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
    protected async handleRaw(frame: Frame): Promise<void> {
        this.emit('raw', frame);
    }
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
    protected sendEvent(name: string, data: Uint8Array | ArrayBuffer): void;
    protected sendEvent(name: string, data: LineCodec.ContentMap, mode: 'LINE'): void;
    protected sendEvent(name: string, data: any): void;
    protected sendEvent(name: string, data: any, mode?: 'LINE'): void {
        const { content, finalMode } = this.serialize(data, mode);
        const frame = Frame.encode('EVENT', finalMode, content, { type: 'STRING', id: name });
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('transport:error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'EVENT', info: { name } }); }
    }

    protected sendRequest(uuid: string, data: Uint8Array | ArrayBuffer): void;
    protected sendRequest(uuid: string, data: LineCodec.ContentMap, mode: 'LINE'): void;
    protected sendRequest(uuid: string, data: any): void;
    protected sendRequest(uuid: string, data?: any, mode?: 'LINE'): void {
        const { content, finalMode } = this.serialize(data, mode);
        const frame = Frame.encode('REQUEST', finalMode, content, { type: 'UUID', id: uuid });
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('transport:error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'REQUEST', uuid, info: {} }); }
    }

    protected sendResponse(uuid: string, data: Uint8Array | ArrayBuffer): void;
    protected sendResponse(uuid: string, data: LineCodec.ContentMap, mode: 'LINE'): void;
    protected sendResponse(uuid: string, data: any): void;
    protected sendResponse(uuid: string, data?: any, mode?: 'LINE'): void {
        const { content, finalMode } = this.serialize(data, mode);
        const frame = Frame.encode('RESPONSE', finalMode, content, { type: 'UUID', id: uuid });
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('transport:error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'RESPONSE', uuid, info: {} }); }
    }
    protected sendError(error: VIOError, uuid?: string): void {
        const json = JSON.stringify({ error: error.message, code: error.code });
        const content = UTF8Codec.encode(json);
        const frame = Frame.encode('ERROR', 'JSON', content, uuid ? { type: 'UUID', id: uuid } : { type: 'NONE' });
        try { this.vTransport.emit('send', frame); }
        catch (err) { this.vTransport.emit('transport:error', err instanceof Error ? err : new Error(String(err)), { stage: 'send', frameType: 'ERROR', uuid, info: {} }); }
    }
    protected serialize(data: any, mode?: 'LINE'): { content: Uint8Array, finalMode: Frame.Mode } {
        if (data instanceof Uint8Array) return { content: data, finalMode: 'BINARY' };
        if (data instanceof ArrayBuffer) return { content: new Uint8Array(data), finalMode: 'BINARY' };
        if (mode === 'LINE') return { content: LineCodec.encode(data), finalMode: 'LINE' };
        const json = JSON.stringify(data ?? {});
        return { content: UTF8Codec.encode(json), finalMode: 'JSON' };
    }
}
export namespace VIO {
    export type TransportEventMap = {
        send: [data: ArrayBuffer];
        'transport:error': [err: Error, ctx?: { stage: 'send' | 'recv' | 'connect', frameType?: Frame.Type | string, uuid?: string, info?: any }];
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
        raw: [data: Frame];
        response: [uuid: string, response: RequestManager.Response];
    }
}
export default VIO;
import { Events, Schema } from "@netfeez/common";
import RequestManager from "./RequestManager.js";
import VIO from "./VIO.js";
import VIOError from "./VIOError.js";
import { Frame } from "./Frame.js";

export const RRSchema = Schema.fromObject({
    name: { type: 'string', required: true },
    content: { type: 'object', required: true }
});

export class VIOStrict<
    const T extends any,
    const IEMap extends VIOStrict.EMap,
    const OEMap extends VIOStrict.EMap,
    const IRRMap extends VIOStrict.RRMap,
    const ORRMap extends VIOStrict.RRMap
> {
    protected readonly VIO: VIO<T>;

    protected readonly vioEmitter: Events.Emitter<VIOStrict.VIOEventMap>;
    protected readonly eventEmitter: Events.Emitter<VIOStrict.EventMap<IEMap>>;
    protected readonly requestEmitter: Events.Emitter<VIOStrict.ReqEventMap<IRRMap>>;

    public constructor(
        dependencies: RequestManager.DEPENDENCIES<T>,
        protected inEMap: IEMap,
        protected outEMap: OEMap,
        protected inRRMap: IRRMap,
        protected outRRMap: ORRMap
    ) {
        this.VIO = new VIO(dependencies);
        this.vioEmitter = new Events.Emitter();
        this.eventEmitter = new Events.Emitter();
        this.requestEmitter = new Events.Emitter();

        this.VIO.on('event', this.eventHandler.bind(this));
        this.VIO.on('request', this.requestHandler.bind(this));
        this.VIO.on('raw', (frame) => this.vioEmitter.emit('raw', frame));
        this.VIO.on('error', (error) => this.vioEmitter.emit('error', error));
    }

    public get trp() { return this.VIO.transport; }
    public get vio(): Events<VIOStrict.VIOEventMap> { return this.vioEmitter; }
    public get evt(): Events<VIOStrict.EventMap<IEMap>> { return this.eventEmitter; }
    public get rqt(): Events<VIOStrict.ReqEventMap<IRRMap>> { return this.requestEmitter; }

    public event<Name extends string & keyof OEMap>(name: Name, data: OEMap[Name]['infer']): void {
        const schema = this.outEMap[name];
        if (!schema) throw new VIOError(VIOError.Code.UNKNOWN_TYPE, `Unknown event type: ${String(name)}`);
        const processedData = schema.processData(data);
        this.VIO.event(name, processedData);
    }
    public async request<id extends string & keyof ORRMap>(action: id, data: ORRMap[id]['request']['inferToProcess'], options?: RequestManager.SendOptions): Promise<ORRMap[id]['response']['infer']> {
        const { request: RQS, response: RSS } = this.outRRMap[action];
        if (!RQS) throw new VIOError(VIOError.Code.UNKNOWN_TYPE, `Unknown request type: ${String(action)}`);
        if (!RSS) throw new VIOError(VIOError.Code.UNKNOWN_TYPE, `Unknown response type: ${String(action)}`);
        const readyData = RQS.processData(data);
        const toSend = RRSchema.processData({ name: action, content: readyData });
        const response = await this.VIO.request(toSend, options);
        if (response.mode !== 'JSON') throw new VIOError(VIOError.Code.INVALID_DATA, `Invalid response mode: ${response.mode}`);
        const parsed = RRSchema.processData(response.data);
        if (parsed.name !== action) throw new VIOError(VIOError.Code.INVALID_DATA, `Response action mismatch: expected ${action}, got ${parsed.name}`);
        return RSS.processData(parsed.content);
    }
    public handle(data: ArrayBuffer | Uint8Array): void {
        this.VIO.handle(data);
    }
    protected eventHandler(name: string, _mode: Frame.Mode, data: any): void {
        const schema = this.inEMap[name];
        if (!schema) throw new VIOError(VIOError.Code.UNKNOWN_TYPE, `Unknown event type: ${String(name)}`);
        const processedData = schema.processData(data);
        this.eventEmitter.emit(name, processedData);
    }
    protected requestHandler(mode: Frame.Mode, data: any, done: (data: any) => void, fail: (error: VIOError) => void): void {
        if (mode !== 'JSON') return fail(new VIOError(VIOError.Code.INVALID_DATA, `Invalid request mode: ${mode}`));
        const parsed = RRSchema.processData(data);
        const { name, content } = parsed;
        const rrEntry = this.inRRMap[name];
        if (!rrEntry) return fail(new VIOError(VIOError.Code.UNKNOWN_TYPE, `Unknown request type: ${String(name)}`));
        const {request: RQS, response: RSS } = rrEntry;
        if (!RQS) return fail(new VIOError(VIOError.Code.UNKNOWN_TYPE, `Missing request schema for type: ${String(name)}`));
        if (!RSS) return fail(new VIOError(VIOError.Code.UNKNOWN_TYPE, `Missing response schema for type: ${String(name)}`));
        let processedRequest: typeof RQS.infer;
        try { processedRequest = RQS.processData(content); }
        catch (error) { return fail(new VIOError(VIOError.Code.INVALID_DATA, `Failed to process request data for type ${String(name)}: ${(error as Error).message}`)); }
        const respond = (responseData: typeof RSS.inferToProcess) => {
            let readyResponse: any;
            try { readyResponse = RSS.processData(responseData); }
            catch (error) { return fail(new VIOError(VIOError.Code.INVALID_DATA, `Failed to process response data for type ${String(name)}: ${(error as Error).message}`)); }
            const toSend = RRSchema.processData({ name, content: readyResponse });
            done(toSend);
        };
        this.requestEmitter.emit(name, processedRequest, respond, fail);
    }
}
export namespace VIOStrict {
    export interface EMap {
        [name: string]: Schema<Schema.Property>;
    }
    export interface RREntry {
        request: Schema<Schema.Definition.Object>;
        response: Schema<Schema.Definition.Object>;
    }
    export interface RRMap {
        [name: string]: RREntry;
    }
    export type VIOEventMap = {
        error: [error: VIOError];
        raw: [frame: Frame];
    }
    export type ReqEventMap<RRMap extends VIOStrict.RRMap> = {
        [Name in string & keyof RRMap]: [
            data: RRMap[Name]['request']['infer'],
            respond: (data: RRMap[Name]['response']['inferToProcess']) => void,
            reject: (error: VIOError) => void
        ];
    }
    export type EventMap<EMap extends VIOStrict.EMap> = {
        [Name in string & keyof EMap]: [data: EMap[Name]['infer']];
    }
}
export default VIOStrict;
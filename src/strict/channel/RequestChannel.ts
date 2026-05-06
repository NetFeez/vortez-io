/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Typed request channel for request/response validation and dispatch.
 */
import { Schema } from "@netfeez/common";
import VIOError from "../../VIOError.js";
import VIO from "../../VIO.js";
import Channel from "./Channel.js";

import type RequestManager from "../../RequestManager.js";
import Frame from "../../Frame.js";

export const RRSchema = Schema.fromObject({
    name: { type: 'string', required: true },
    content: { type: 'object', allowAdditionalProperties: true, required: true }
});

export class RequestChannel<
    const TimeoutType extends any,
    const IRRMap extends RequestChannel.RRMap,
    const ORRMap extends RequestChannel.RRMap
> extends Channel<TimeoutType, RequestChannel.EventMap<IRRMap>> {
    public constructor(
        protected VIO: VIO<TimeoutType>,
        protected inRRMap: IRRMap,
        protected outRRMap: ORRMap
    ) { super(VIO);
        this.VIO.on('request', this.handle.bind(this));
    }
    /**
     * Sends a request to the remote side and awaits a response. The request action must be defined in the ORRMap, and the request data must conform to the schema defined for that action. If the action is not recognized, or if the request data does not conform to the schema, a VIOError will be thrown. The method returns a promise that resolves with the response data processed according to the schema defined for the response of that action.
     * @param action The name of the request action to send. Must be a key in the ORRMap.
     * @param data The data to send with the request. Must conform to the schema defined for the request in the ORRMap.
     * @param options Optional settings for sending the request, such as timeout duration and retry attempts.
     * @returns A promise that resolves with the response data processed according to the schema defined for the response of the specified action.
     * @throws VIOError if the action is not recognized or if the request data does not conform to the schema.
     */
    public override async send<Action extends string & keyof ORRMap>(action: Action, data: ORRMap[Action]['request']['inferToProcess'], options?: RequestManager.SendOptions): Promise<ORRMap[Action]['response']['infer']> {
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
    /**
     * Handles incoming requests from the remote side.
     * The request action must be defined in the IRRMap, and the request data must conform to the schema defined for that action.
     * If the action is not recognized, or if the request data does not conform to the schema, the fail callback will be called with a VIOError.
     * If the request is valid, the corresponding event will be emitted with the processed request data, a respond callback for sending the response, and a reject callback for handling errors.
     * The respond callback should be called with the response data, which will be processed according to the schema defined for the response of that action before being sent back to the requester.
     * The reject callback should be called with a VIOError if there is an error processing the request or preparing the response.
     * @param mode The mode of the incoming request, which should be 'JSON' for valid requests.
     * @param data The raw data of the incoming request, which should be processed according to the schema defined for the request action in the IRRMap.
     * @param done A callback function that should be called with the response data once it is ready to be sent back to the requester. The response data will be processed according to the schema defined for the response of the request action in the IRRMap before being sent.
     * @param fail A callback function that should be called with a VIOError if there is an error processing the request or preparing the response. This will send an error response back to the requester.
     */
    protected override handle(mode: Frame.Mode, data: any, done: (data: any) => void, fail: (error: VIOError) => void): void {
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
        this.emit(name, processedRequest, respond, fail);
    }
}
export namespace RequestChannel {
    export interface RREntry {
        request: Schema<Schema.Definition.Object>;
        response: Schema<Schema.Definition.Object>;
    }
    export interface RRMap {
        [name: string]: RREntry;
    }
    export type EventMap<RRMap extends RequestChannel.RRMap> = {
        [Name in string & keyof RRMap]: [
            data: RRMap[Name]['request']['infer'],
            respond: (data: RRMap[Name]['response']['inferToProcess']) => void,
            reject: (error: VIOError) => void
        ];
    }
}
export default RequestChannel;
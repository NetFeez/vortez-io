/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Strict typed wrapper around VIO event, request, and transport channels.
 */
import Isomorphic from "../support/Isomorphic.js";

import { Events } from "@netfeez/common";

import VIO from "../VIO.js";
import VIOError from "../VIOError.js";
import Frame from "../Frame.js";

import EventChannel from "./channel/EventChannel.js";
import RequestChannel from "./channel/RequestChannel.js";
import TransportChannel from "./channel/TransportChannel.js";

export class VIOStrict<
    const TimeoutType extends any,
    const IEMap extends EventChannel.EMap,
    const OEMap extends EventChannel.EMap,
    const IRRMap extends RequestChannel.RRMap,
    const ORRMap extends RequestChannel.RRMap
> extends Events<VIOStrict.EventMap> {
    protected readonly VIO: VIO<TimeoutType>;

    public readonly event: EventChannel<TimeoutType, IEMap, OEMap>;
    public readonly request: RequestChannel<TimeoutType, IRRMap, ORRMap>;
    public readonly transport: TransportChannel<TimeoutType>;

    public constructor(
        dependencies: Isomorphic.DependencyList<TimeoutType>,
        protected inEMap: IEMap,
        protected outEMap: OEMap,
        protected inRRMap: IRRMap,
        protected outRRMap: ORRMap
    ) { super();
        const vio = new VIO(dependencies);
        this.VIO = vio;

        this.event = new EventChannel(vio, inEMap, outEMap);
        this.request = new RequestChannel(vio, inRRMap, outRRMap);
        this.transport = new TransportChannel(vio);

        vio.on('raw', (...args) => this.emit('raw', ...args));
        vio.on('error', (...args) => this.emit('error', ...args));
    }
    /**
     * Sends a raw data frame through the transport layer.
     * This method is used to send data that does not conform to the structured formats defined in the EventChannel or RequestChannel, allowing for more flexible communication when needed.
     * The data should be provided as a Frame with mode 'RAW', and it will be sent through the VIO instance's transport layer.
     * @param data The raw data frame to send, which should be a Frame with mode 'RAW'. The method will extract the data from the frame and send it through the transport layer.
     * 
     * ⚠️ WARNING: Using this method can lead to runtime errors and unexpected behavior if the data is not recognized by the remote side.
     * Use only when you are certain that the data will be handled correctly on the remote side.
     * 
     * This is a convenience method: it delegates to `transport.send()` so callers
     * can either call `vioStrict.raw(...)` or `vioStrict.transport.send(...)`.
     *
     * Semantics:
     * - `raw(...)` / `transport.send(...)` send raw bytes through the transport
     *   layer (same as sending a `RAW` frame).
     * - `transport` also re-emits incoming `raw` frames from the underlying
     *   `VIO` instance; `vioStrict` itself also emits `raw` (duplicated for
     *   convenience).
     *
     * Use `raw` only when you intentionally want to bypass the typed
     * `event`/`request` channels and exchange transport-level payloads.
     *
     * @param data The raw data to be sent, which can be an ArrayBuffer or Uint8Array.
     */
    public raw(data: ArrayBuffer | Uint8Array): void { this.transport.send(data); }
}
export namespace VIOStrict {
    export import EMap = EventChannel.EMap;
    export import RRMap = RequestChannel.RRMap;
    export import DependencyList = Isomorphic.DependencyList;
    
    export type EventMap = {
        raw: [data: Frame<'RAW'>];
        error: [error: VIOError];
    };
}
export default VIOStrict;
/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Typed event channel for validating inbound and outbound event payloads.
 */
import type { Schema } from "@netfeez/common";
import type VIO from "../../VIO.js";

import Channel from "./Channel.js";
import VIOError from "../../VIOError.js";
import Frame from "../../Frame.js";

export class EventChannel<
    const TimeoutType extends any,
    const IEMap extends EventChannel.EMap,
    const OEMap extends EventChannel.EMap,
> extends Channel<TimeoutType, EventChannel.EventMap<IEMap>> {
    public constructor(
        protected VIO: VIO<TimeoutType>,
        protected inEMap: IEMap,
        protected outEMap: OEMap,
    ) { super(VIO);
        this.VIO.on('event', this.handle.bind(this));
    }
    /**
     * Sends a custom event to the remote side without validating the event name or data against the OEMap.
     * This method should be used with caution, as it bypasses all type safety and validation checks.
     * It is recommended to use the send method instead, which ensures that the event name and data conform to the defined schemas in the OEMap.
     * 
     * ⚠️ WARNING: Using this method can lead to runtime errors and unexpected behavior if the event name or data is not recognized by the remote side.
     * Use only when you are certain that the event will be handled correctly on the remote side.
     * 
     * @param name The name of the event to send. Can be any string.
     * @param data The data to send with the event. Can be any value.
     */
    public custom(name: string, data: any): void {
        this.VIO.event(name, data);
    }
    /**
     * Sends an event to the remote side.
     * The event name must be defined in the OEMap, and the data must conform to the schema defined for that event. If the event name is not recognized, or if the data does not conform to the schema, a VIOError will be thrown.
     * @param name The name of the event to send. Must be a key in the OEMap.
     * @param data The data to send with the event. Must conform to the schema defined for the event in the OEMap.
     * @throws VIOError if the event name is not recognized or if the data does not conform to the schema.
     */
    public override send<Name extends string & keyof OEMap>(name: Name, data: OEMap[Name]['infer']): void {
        const schema = this.outEMap[name];
        if (!schema) throw new VIOError(VIOError.Code.UNKNOWN_TYPE, `Unknown event type: ${String(name)}`);
        const processedData = schema.processData(data);
        this.VIO.event(name, processedData);
    }
    /**
     * Handles incoming events by validating the event name and data against the IEMap, and then emitting the event if it is recognized. If the event name is not recognized, or if the data does not conform to the schema, a VIOError will be thrown.
     * @param name The name of the incoming event. Must be a key in the IEMap.
     * @param mode The mode of the incoming frame, which can be used for additional processing if needed.
     * @param data The data associated with the incoming event. Must conform to the schema defined for the event in the IEMap.
     * @throws VIOError if the event name is not recognized or if the data does not conform to the schema.
     */
    protected override handle(name: string, mode: Frame.Mode, data: any): void {
        const schema = this.inEMap[name];
        if (!schema) throw new VIOError(VIOError.Code.UNKNOWN_TYPE, `Unknown event type: ${String(name)}`);
        const processed = schema.processData(data);
        this.emit(name, processed);
    }
}
export namespace EventChannel {
    export interface EMap {
        [name: string]: Schema<Schema.Property>;
    }
    export type EventMap<EMap extends EventChannel.EMap> = {
        [Name in string & keyof EMap]: [data: EMap[Name]['infer']];
    }
}
export default EventChannel;
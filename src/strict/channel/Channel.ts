/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Base abstract channel shared by strict VIO channel implementations.
 */
import { Events } from "@netfeez/common";
import VIO from "../../VIO.js";

export abstract class Channel<
    TimeoutType extends any,
    EventMap extends Events.EventMap
> extends Events<EventMap> {
    public constructor(
        protected readonly VIO: VIO<TimeoutType>
    ) { super(); }
    /**
     * Sends a message through the channel.
     * The implementation of this method should handle the actual transmission of the message, whether it's through a WebSocket, HTTP request, or any other means.
     * The arguments and return type can be defined based on the specific requirements of the channel implementation.
     * 
     * ⚠️ IMPORTANT: The visibility of this method should be carefully considered based on how it will be used within the application.
     * If the channel is intended to be used internally within a module or class, it may be appropriate to keep this method protected.
     * However, if the channel needs to be accessed and handled from outside its defining class, it may need to be made public.
     */
    protected abstract send(...args: any[]): any;
    /**
     * Handles incoming messages for the channel.
     * The implementation of this method should process the incoming data, validate it, and emit the appropriate events based on the EventMap defined for the channel.
     * The arguments can be defined based on the specific requirements of the channel implementation, such as the raw data received and any metadata associated with it.
     * 
     * ⚠️ IMPORTANT: The visibility of this method should be carefully considered based on how it will be used within the application.
     * If the channel is intended to be used internally within a module or class, it may be appropriate to keep this method protected.
     * However, if the channel needs to be accessed and handled from outside its defining class, it may need to be made public.
     */
    protected abstract handle(...args: any[]): any;
}
export namespace Channel {}
export default Channel;
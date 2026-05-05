/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Transport channel bridge for raw frame send and receive events.
 */
import Frame from "../../Frame.js";
import VIO from "../../VIO.js";
import Channel from "./Channel.js";

export class TransportChannel<TimeoutType extends any> extends Channel<TimeoutType, TransportChannel.EventMap> {
    constructor(protected VIO: VIO<TimeoutType>) { super(VIO);
        this.VIO.transport.on('send', (...args) => this.emit('send', ...args));
        this.VIO.transport.on('error', (...args) => this.emit('error', ...args));
        this.VIO.on('raw', (...args) => this.emit('raw', ...args));
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
    * @param data The raw data to be sended, which can be an ArrayBuffer or Uint8Array.
     */
    public override send(data: ArrayBuffer | Uint8Array): void { this.VIO.raw(data); }
    /**
     * Handles incoming raw data frames by passing them to the VIO instance for processing. This method is called when raw data is received from the transport layer, and it should not be called directly by external code. The VIO instance will handle the raw data and emit the appropriate events based on the content of the frame.
     * @param data The raw data frame received from the transport layer, which can be an ArrayBuffer or Uint8Array.
     */
    protected override handle(data: ArrayBuffer | Uint8Array): void { this.VIO.handle(data); }
}
export namespace TransportChannel {
    export type EventMap = {
        send: [frame: ArrayBuffer];
        raw: [frame: Frame<'RAW'>];
        error: [error: Error, context: VIO.ErrorContext];
    };
}
export default TransportChannel;
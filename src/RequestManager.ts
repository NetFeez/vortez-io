/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Tracks pending requests, timeouts, and response handling for VIO.
 */
import { Events } from "@netfeez/common";

import UUID from "./support/UUID.js";
import VIOError from "./VIOError.js";

import type Frame from "./Frame.js";
import type Isomorphic from "./support/Isomorphic.js";

export class RequestManager<TimeoutType extends any> extends Events<RequestManager.EventMap> {
    protected pending: Map<string, RequestManager.PendingEntry<TimeoutType>> = new Map();

    protected setTimeout: Isomorphic.setTimeout<TimeoutType>;
    protected clearTimeout: Isomorphic.clearTimeout<TimeoutType>;
    protected createUUID: Isomorphic.createUUID;

    public constructor(dependencies: Isomorphic.DependencyList<TimeoutType>) { super();
        this.setTimeout = dependencies.setTimeout;
        this.clearTimeout = dependencies.clearTimeout;
        this.createUUID = dependencies.createUUID || UUID.create;
    }
    /**
     * Send a request with the given data and return a Promise that resolves with the response or rejects with an error.
     * The method generates a unique UUID for the request, stores the resolve and reject functions in the pending map, and emits a 'send' event with the UUID and data.
     * The handler method should be called when a response or error is received, which will look up the corresponding entry in the pending map and resolve or reject the Promise accordingly.
     * @param data The data to be sent with the request. This can be of any type depending on the application's needs.
     * @param options The options for the request, including a timeout duration.
     */
    public send(data: any, options: RequestManager.SendOptions = {}): Promise<RequestManager.Response> {
        const { timeoutMs = 30000 } = options;
        const uuid = this.createUUID();
        return new Promise((resolve, reject) => {
            const timeout: TimeoutType = this.setTimeout(() => {
                this.pending.delete(uuid);
                reject(new VIOError(VIOError.Code.INVALID_DATA, 'Request timed out'));
            }, timeoutMs);

            this.pending.set(uuid, { resolve, reject, timeout });

            try {
                this.emit('send', uuid, data);
            } catch (error) {
                this.clearTimeout(timeout);
                this.pending.delete(uuid);
                reject(error instanceof VIOError ? error : new VIOError(VIOError.Code.INVALID_DATA, 'Failed to queue request'));
            }
        });
    }
    /**
     * Handle a response or error for a request identified by the given UUID. This method should be called when a response or error is received for a previously sent request.
     * It looks up the corresponding entry in the pending map using the UUID. If an entry is found, it resolves the Promise with the provided data if there is no error, or rejects it with the provided error if there is one. Finally, it removes the entry from the pending map to clean up resources.
     * @param uuid The unique identifier for the request, which should match the UUID generated when the request was sent.
     * @param data The response data to resolve the Promise with if there is no error.
     * @param error The error to reject the Promise with if an error occurred.
     */
    public handle(uuid: string, data?: RequestManager.Response, error?: VIOError): void {
        const entry = this.pending.get(uuid);
        if (!entry) return;

        this.clearTimeout(entry.timeout);

        if (error) entry.reject(error);
        else entry.resolve(data ?? { mode: 'BINARY', data: new Uint8Array(0) });

        this.pending.delete(uuid);
    }
}
export namespace RequestManager {
    export namespace Response {
        export type Base = { mode: Frame.Mode };
        export interface Binary extends Base {
            mode: 'BINARY' | 'CUSTOM';
            data: Uint8Array;
        }
        export interface Json extends Base {
            mode: 'JSON';
            data: any;
        }
        export interface Line extends Base {
            mode: 'LINE';
            data: Record<string, string>;
        }
    }
    export type Response = Response.Binary | Response.Json | Response.Line;
    export type EventMap = {
        send: [uuid: string, data?: any];
        error: [error: VIOError];
    };

    /**
     * Represents a pending request entry in the RequestManager.
     * Each entry contains the resolve and reject functions for the Promise associated with the request, as well as a timeout identifier if a timeout mechanism is implemented.
     * The resolve function is called with the response data when a successful response is received, while the reject function is called with an error if an error occurs or if a timeout is reached.
     * The timeout field can be used to store the identifier returned by a setTimeout function, allowing for the implementation of request timeouts where the Promise is rejected if a response is not received within a certain timeframe.
     * @template TimeoutType The type of the timeout identifier, which can vary depending on the environment (e.g., NodeJS.Timeout in Node.js or number in browsers).
     */
    export interface PendingEntry<TimeoutType> {
        resolve: (value: Response) => void;
        reject: (reason: VIOError) => void;
        timeout: TimeoutType;
    }

    export interface SendOptions {
        timeoutMs?: number;
    }

    export type Done<T> = (data: T) => void;
    export type Fail = (error: VIOError) => void;
}
export default RequestManager;
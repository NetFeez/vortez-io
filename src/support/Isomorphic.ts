/**
 * @module vortez-io
 * @author NetFeez <netfeez.dev@gmail.com>
 * @license Apache-2.0
 * @description Isomorphic dependency types shared across runtime environments.
 */
export namespace Isomorphic {
    export type TimeoutHandler = () => void | Promise<void>;
    export type setTimeout<T> = (handler: TimeoutHandler, timeout: number) => T;
    export type clearTimeout<T> = (id: T) => void;
    export type createUUID = () => string;

    export interface DependencyList<TimeoutType extends any> {
        setTimeout: Isomorphic.setTimeout<TimeoutType>;
        clearTimeout: Isomorphic.clearTimeout<TimeoutType>;
        createUUID?: Isomorphic.createUUID;
    }
}
export default Isomorphic;
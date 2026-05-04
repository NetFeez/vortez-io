export namespace Isomorphic {
    export type TimeoutHandler = () => void | Promise<void>;
    export type setTimeout<T> = (handler: TimeoutHandler, timeout: number) => T;
    export type clearTimeout<T> = (id: T) => void;
    export type createUUID = () => string;
}
export default Isomorphic;
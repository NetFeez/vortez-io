# Vortez IO

`vortez-io` is a small TypeScript library for encoding and decoding the Vortez IO binary frame format used over WebSocket connections. It implements the protocol described in [PROTOCOL.md](PROTOCOL.md) and provides helpers for request/response correlation, event delivery, and strict frame validation.

## Features

- Binary frame encoding and decoding
- Request/response correlation with UUID identifiers
- Event frames with string identifiers
- Support for `BINARY`, `JSON`, `LINE`, and `CUSTOM` payload modes
- Strict protocol validation with typed errors
- Higher-level typed wrapper via `VIOStrict`
- Transport-agnostic runtime with a small, composable API surface

## Installation

```bash
npm install vortez-io
```

The library is published from the TypeScript source in this repository and targets an ES module environment.

## Quick Start

```ts
import VIO, { VIOError } from 'vortez-io';

const vio = new VIO({
	setTimeout,
	clearTimeout,
	createUUID: () => crypto.randomUUID()
});

vio.transport.on('send', (frame) => {
	websocket.send(frame);
});

websocket.onmessage = (event) => {
	vio.handle(event.data);
};

vio.on('event', (name, mode, data) => {
	console.log('event:', name, mode, data);
});

vio.on('request', (mode, data, respond, reject) => {
	if (mode !== 'JSON') {
		reject(new VIOError(VIOError.Code.INVALID_DATA, 'Unsupported request mode'));
		return;
	}

	respond({ ok: true });
});

vio.event('connected', { ok: true });
const response = await vio.request({ action: 'ping' });
```

## Core API

### `VIO`

The main transport-aware protocol runtime.

- `request(data, options?)`: send a request and await a response
- `event(name, data)`: send an event frame
- `handle(data)`: decode an incoming frame and dispatch it
- `transport`: event emitter that exposes outgoing frames through `send`
- `raw(data)`: send transport-level bytes without higher-level framing

### `Frame`

Low-level frame encoder/decoder for protocol payloads.

- `Frame.encode(...)`
- `Frame.decode(...)`

Use this when you need direct access to protocol bytes instead of the higher-level `VIO` API.

### `VIOStrict`

Typed wrapper for validating request and event payloads with schemas from `@netfeez/common`.

## Architecture Guide

For a higher-level view of the runtime layers, message flow, and the role of `VIO`, `Frame`, `RequestManager`, and `VIOStrict`, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Protocol Summary

The protocol is described in detail in [PROTOCOL.md](PROTOCOL.md). In short:

- Each WebSocket message contains exactly one Vortez frame
- Every frame starts with three header bytes
- `REQUEST` and `RESPONSE` frames use UUID identifiers
- `EVENT` frames use string identifiers
- `ERROR` frames can be protocol-level (`NONE`) or request-bound (`UUID`)

## Documentation Map

- [README.md](README.md): project overview, install, and quick start.
- [PROTOCOL.md](PROTOCOL.md): wire format and protocol rules.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): runtime layers and message flow.
- [docs/VIOStrict.md](docs/VIOStrict.md): typed wrapper example and schema map wiring.

## Development

```bash
npm run build
```

The build script compiles the TypeScript sources into the `build/` directory.

## License

Apache-2.0

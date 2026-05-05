# VIOStrict Example

This document shows how to build a typed wrapper around Vortez IO using `VIOStrict`.

The goal is the same as in a real application: define your schema maps once, keep request and event payloads typed, and let the strict wrapper validate traffic at the boundary.

## When To Use It

- You want named, schema-validated events.
- You want request and response shapes enforced at the call site.
- You want one place to wire transport, validation, and typed channels together.

## Example

```ts
import { Schema } from '@netfeez/common';
import { VIOStrict } from 'vortez-io';

const dependencies = {
	setTimeout,
	clearTimeout,
};

export const clientEvents = {
	message: Schema.fromObject({
		user: { type: 'object', required: true, properties: {
			username: { type: 'string', required: true },
			role: { type: 'string', enum: ['system', 'admin', 'user'], default: 'user' },
			avatar: { type: 'string', default: '/favicon.ico' }
		} },
		message: { type: 'string', required: true }
	}),
	'writing-started': Schema.fromObject({
		username: { type: 'string', required: true }
	}),
	'writing-stopped': Schema.fromObject({
		username: { type: 'string', required: true }
	})
} satisfies VIOStrict.EMap;

export const serverEvents = {
	...clientEvents,
	message: Schema.fromObject({
		message: { type: 'string', required: true }
	}),
} satisfies VIOStrict.EMap;

export const clientRequests = {
} satisfies VIOStrict.RRMap;

export const serverRequests = {
} satisfies VIOStrict.RRMap;

export class ChatClient extends VIOStrict<
	number,
	typeof serverEvents,
	typeof clientEvents,
	typeof clientRequests,
	typeof serverRequests
> {
	public constructor() {
		super(dependencies, serverEvents, clientEvents, clientRequests, serverRequests);
	}
}
```

## How It Maps To The Runtime

- `dependencies` provides the timeout functions used by `RequestManager` through `VIO`.
- `serverEvents` defines what this client can receive.
- `clientEvents` defines what this client can send.
- `serverRequests` defines the requests this client can receive.
- `clientRequests` defines the requests this client can send.

`VIOStrict` composes the underlying `VIO` instance and exposes three typed channels:

- `event` for schema-validated events.
- `request` for schema-validated request/response flows.
- `transport` for raw byte transport and low-level frame wiring.

## Typical Wiring

In a real application, you would connect the transport channel to your socket adapter:

```ts
const chat = new ChatClient();

chat.transport.on('send', (frame) => {
	websocket.send(frame);
});

websocket.onmessage = (event) => {
	chat.transport.handle(event.data);
};

chat.event.on('message', (data) => {
	console.log('message from server:', data);
});
```

## Notes

- Keep the schema maps in the same file or a nearby support module when the contract is small.
- Split them into separate modules once the application grows.
- Prefer `event.custom(...)` or `request.send(...)` only when you intentionally want to bypass the typed surface.

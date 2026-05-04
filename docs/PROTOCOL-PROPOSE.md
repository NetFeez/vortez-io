> [!IMPORTANT]
> THIS IS THE FIRST REVISION OF THE PROTOCOL, THIS IS NOT APPLICABLE
> THIS DOCUMENT IS ONLY FOR HISTORIC DOCUMENTATION
> SEE THE [REAL SPECIFICATION HERE](https://github.com/NetFeez/vortez-io-protocol/blob/main/PROTOCOL.md)

# Vortez IO Protocol

Vortez IO Protocol works over WebSocket protocol and defines a binary frame structure for multiplexed messaging (events, requests, responses and errors).

Each WebSocket frame **MUST** contain exactly **one Vortez frame**.

---

## Protocol Frame Description

### Header description map

| byte | bit | Function | description                 |
| ---- | --- | -------- | --------------------------- |
| 0    | 0-3 | TYPE     | [Reference for type](#type) |
| 0    | 4-6 | MODE     | [Reference for mode](#mode) |
| 0    | 7   | HUID     | [Reference for huid](#huid) |

> [!IMPORTANT]
>
> 🔒 **Invariant:** Header byte (byte 0) is always present.
>
> 🔒 **Invariant:** Header byte (byte 1) is always present and reserved.

---

## Frame Layout

### If `HUID = 0b1`

| byte | Function | description                 |
| ---- | -------- | --------------------------- |
| 2-17 | UUID     | 16-byte identifier (binary) |
| 18.. | DATA     | Payload                     |

### If `HUID = 0b0`

| byte | Function | description |
| ---- | -------- | ----------- |
| 2..  | DATA     | Payload     |

---

## UUID Specification

* UUID **MUST** be exactly **16 bytes**
* UUID **MUST** be treated as opaque binary (no string encoding)
* Endianness is **network order (big-endian)**
* UUID is used for **request-response correlation**

---

## TYPE

Defines the semantic meaning of the frame.

| Value | Name     | Description                |
| ----- | -------- | -------------------------- |
| `0x0` | RAW      | Unstructured binary data   |
| `0x1` | EVENT    | Fire-and-forget message    |
| `0x2` | REQUEST  | Request expecting response |
| `0x3` | RESPONSE | Response to a request      |
| `0x4` | ERROR    | Error frame                |

---

### TYPE Rules

#### `0x0` RAW

* **MAY** include any MODE
* **MUST NOT** rely on protocol-level semantics
* **MUST NOT** require UUID
* Receiver **MUST NOT** assume structure

---

#### `0x1` EVENT

* **MUST NOT** include UUID (`HUID = 0`)
* **MUST** be treated as one-way message
* Receiver **MUST NOT** send RESPONSE automatically

---

#### `0x2` REQUEST

* **MUST** include UUID (`HUID = 1`)
* UUID **MUST** be unique per connection (until resolved)
* Receiver **MUST** respond with either:

  * `RESPONSE (0x3)`
  * or `ERROR (0x4)`

---

#### `0x3` RESPONSE

* **MUST** include UUID (`HUID = 1`)
* UUID **MUST** match an existing REQUEST
* Receiver **MUST** resolve the associated request

---

#### `0x4` ERROR

Error frames represent protocol or application failures.

* **MAY** include UUID
* If UUID is present:

  * it **MUST** reference the related REQUEST
* If UUID is absent:

  * it represents a **connection-level or protocol-level error**

---

## ERROR Semantics

We define two clear categories:

### 1. Error Response (Request-bound)

Used as a response to a request.

* TYPE: `0x4`
* HUID: `1`
* MUST include UUID
* MUST correspond to a REQUEST

Example causes:

* invalid payload
* handler failure
* validation error

---

### 2. Error Feedback (Unbound / Protocol-level)

Used when no request context exists.

* TYPE: `0x4`
* HUID: `0`
* MUST NOT include UUID

Example causes:

* malformed frame
* invalid header bits
* unsupported TYPE or MODE
* protocol violation

---

### Error Behavior Rules

If a frame violates protocol:

* Receiver **MUST** send `ERROR (0x4)`
* If UUID is available → **MUST include it**
* Otherwise → **MUST send without UUID**

---

## MODE

Defines how DATA should be interpreted.

| Value | Name   | Description                          |
| ----- | ------ | ------------------------------------ |
| `0x0` | BINARY | Binary                               |
| `0x1` | JSON   | UTF-8 encoded JSON                   |
| `0x2` | LINE   | UTF-8 text terminated by LF (`0x0A`) |
| `0x3` | CUSTOM | Application-defined                  |

---

### MODE Rules

#### JSON (`0x1`)

* DATA **MUST** be valid UTF-8 JSON
* Receiver **MUST** parse as JSON

---

#### LINE (`0x2`)

* DATA **MUST** be UTF-8 text
* Messages **SHOULD** end with `\n` (`0x0A`)
* Receiver **MAY** trim trailing newline

---

#### CUSTOM (`0x3`)

* Interpretation is application-defined
* Protocol **MUST NOT** enforce structure

---

## HUID

Defines presence of UUID.

| Value | Meaning      |
| ----- | ------------ |
| `0b0` | No UUID      |
| `0b1` | UUID present |

---

## HUID Rules

| TYPE             | HUID | Rule                  |
| ---------------- | ---- | --------------------- |
| RAW (`0x0`)      | ANY  | MAY include UUID      |
| EVENT (`0x1`)    | 0    | MUST NOT include UUID |
| REQUEST (`0x2`)  | 1    | MUST include UUID     |
| RESPONSE (`0x3`) | 1    | MUST include UUID     |
| ERROR (`0x4`)    | ANY  | Context-dependent     |

---

## Reserved Space (Future Use)

* Byte `1` is **implicitly reserved**
* Future versions **MAY** introduce:

  * length prefix
  * flags
  * versioning

Current implementations:

* **MUST ignore** any future extension unless negotiated

---

## Protocol Guarantees

* One WebSocket frame = one Vortez frame
* No internal framing is used
* Ordering is delegated to WebSocket
* Reliability is delegated to transport

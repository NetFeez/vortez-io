# Vortez IO Protocol

Vortez IO Protocol works over WebSocket protocol and defines a binary frame structure for multiplexed messaging (events, requests, responses and errors).

Each WebSocket frame **MUST** contain exactly **one Vortez frame**.

---

## Protocol Frame Description

### Header description map

| byte | bit | Function | description                       |
| ---- | --- | -------- | --------------------------------- |
| 0    | 0-3 | TYPE     | [Reference for type](#type)       |
| 0    | 4-7 | MODE     | [Reference for mode](#mode)       |
| 1    | all | RESERVED | Future use                        |
| 2    | 0-1 | ID_TYPE  | [Reference for id-type](#id_type) |
| 2    | 2-7 | RESERVED | MUST be `0`                       |

> [!IMPORTANT]
>
> 🔒 **Invariant:** Header bytes (0, 1, 2) are always present.
>
> 🔒 **Invariant:** Reserved bits **MUST** be `0`.

---

## Frame Layout

After byte `2`, the frame continues depending on `ID_TYPE`.

---

### If `ID_TYPE = 0x0 (NONE)`

| byte | Function | description |
| ---- | -------- | ----------- |
| 3..  | DATA     | Payload     |

---

### If `ID_TYPE = 0x1 (UUID)`

| byte | Function | description                 |
| ---- | -------- | --------------------------- |
| 3-18 | UUID     | 16-byte identifier (binary) |
| 19.. | DATA     | Payload                     |

---

### If `ID_TYPE = 0x2 (STRING)`

| byte   | Function       | description                        |
| ------ |----------------|------------------------------------|
| 3..N   | VARINT LENGTH  | Length of the string               |
| N+1..M | STRING         | UTF-8 identifier                   |
| M+1..  | DATA           | Payload                            |

---

## ID_TYPE

Defines the type of identifier present in the frame.

| Value | Name     | Description                |
| ----- |----------|----------------------------|
| `0x0` | NONE     | No identifier              |
| `0x1` | UUID     | 16-byte binary identifier  |
| `0x2` | STRING   | UTF-8 string identifier    |
| `0x3` | RESERVED | Reserved for future use    |

---

## UUID Specification

* UUID **MUST** be exactly **16 bytes**
* UUID **MUST** be treated as opaque binary (no string encoding)
* Endianness is **network order (big-endian)**
* UUID is used for **request-response correlation**

---

## STRING Specification

* Length **MUST** be encoded using varint
* Content **MUST** be valid UTF-8
* SHOULD be used for event names or routing keys

---

## Varint Encoding

Used for encoding STRING length.

| bit | Function |
|-----|----------|
| 7   | CONTINUE |
| 0-6 | VALUE    |

Rules:

* CONTINUE = `1` → more bytes follow
* CONTINUE = `0` → last byte
* Encoding uses **unsigned LEB128 (base-128)**

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

---

#### `0x1` EVENT

* MUST use STRING identifier
* MUST NOT require response

---

#### `0x2` REQUEST

* MUST use `UUID`
* UUID MUST be unique per connection
* Receiver MUST respond with:

  * `RESPONSE (0x3)`
  * or `ERROR (0x4)`

---

#### `0x3` RESPONSE

* MUST use `UUID`
* MUST match an existing request

---

#### `0x4` ERROR

* MAY include identifier
* Behavior depends on context

---

## ERROR Semantics

### 1. Error Response (Request-bound)

* TYPE: `0x4`
* ID_TYPE: `UUID`
* MUST reference an existing request

---

### 2. Error Feedback (Protocol-level)

* TYPE: `0x4`
* ID_TYPE: `NONE`
* MUST NOT include identifier

---

### Error Behavior Rules

If a frame violates protocol:

* Receiver **MUST** send `ERROR (0x4)`
* If request context exists → **MUST include UUID**
* Otherwise → **MUST use ID_TYPE = NONE**

---

## MODE

Defines how DATA should be interpreted.

| Value | Name   | Description                          |
| ----- | ------ | ------------------------------------ |
| `0x0` | BINARY | Raw binary                           |
| `0x1` | JSON   | UTF-8 encoded JSON                   |
| `0x2` | LINE   | UTF-8 text terminated by LF (`0x0A`) |
| `0x3` | CUSTOM | Application-defined                  |

---

### MODE Rules

#### JSON (`0x1`)

* DATA **MUST** be valid UTF-8 JSON

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

## Reserved Space (Future Use)

* Byte `1` is reserved
* ID_META reserved bits MUST be `0`
* Future versions MAY introduce:

  * flags
  * compression
  * fragmentation

---

## Protocol Guarantees

* One WebSocket frame = one Vortez frame
* No internal framing is used
* Ordering is delegated to WebSocket
* Reliability is delegated to transport
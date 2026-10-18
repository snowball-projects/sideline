import test from "node:test";
import assert from "node:assert/strict";
import { readResponseText } from "../web/response.mjs";

const encode = (text) => new TextEncoder().encode(text);
function streamed(chunks, headers = {}) {
  let reads = 0, cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      reads++;
      if (chunks.length) controller.enqueue(chunks.shift());
      else controller.close();
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  return { response: new Response(body, { headers }),
    reads: () => reads, cancelled: () => cancelled };
}

test("bounded reads preserve UTF-8 characters split across chunks at the exact byte limit", async () => {
  const text = '{"name":"José 🏈"}';
  const bytes = encode(text);
  const source = streamed(Array.from(bytes, (byte) => Uint8Array.of(byte)));
  assert.equal(await readResponseText(source.response, bytes.byteLength), text);
  assert.equal(source.cancelled(), false);
  assert.equal(source.response.body.locked, false);
});

test("small chunks cross buffer growth boundaries without changing data", async () => {
  const text = "é🏈".repeat(30_000);
  const bytes = encode(text);
  const chunks = [];
  for (let start = 0; start < bytes.length; start += 127)
    chunks.push(bytes.subarray(start, start + 127));
  const source = streamed(chunks);
  assert.equal(await readResponseText(source.response, bytes.length), text);
});

for (const headers of [{}, { "content-length": "1" }, { "content-length": "unknown" }]) {
  test("chunked oversize cancels at first excess chunk despite length " + JSON.stringify(headers), async () => {
    const source = streamed([encode("1234"), encode("56"), encode("unread tail")], headers);
    await assert.rejects(readResponseText(source.response, 5), /byte limit/);
    assert.equal(source.reads(), 2);
    assert.equal(source.cancelled(), true);
    assert.equal(source.response.body.locked, false);
  });
}

test("multibyte payload below a UTF-16 limit still exceeds the byte bound", async () => {
  const text = "é🏈";
  assert.equal(text.length, 3);
  assert.equal(encode(text).byteLength, 6);
  const source = streamed([encode(text), encode("unread tail")]);
  await assert.rejects(readResponseText(source.response, 5), /byte limit/);
  assert.equal(source.reads(), 1);
  assert.equal(source.cancelled(), true);
});

test("oversized advertised length rejects and cancels before reading", async () => {
  const source = streamed([encode("not read")], { "content-length": "99999999999999999999" });
  await assert.rejects(readResponseText(source.response, 5), /byte limit/);
  assert.equal(source.reads(), 0);
  assert.equal(source.cancelled(), true);
});

test("empty responses and response stream errors release the reader", async () => {
  assert.equal(await readResponseText(new Response(null), 0), "");
  const source = new Response(new ReadableStream({
    start(controller) { controller.error(new Error("interrupted")); },
  }));
  await assert.rejects(readResponseText(source, 100), /interrupted/);
  assert.equal(source.body.locked, false);
});

test("cancellation failure preserves the original size error", async () => {
  const source = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(encode("too large")); },
    cancel() { throw new Error("cancel failed"); },
  }, { highWaterMark: 0 }));
  await assert.rejects(readResponseText(source, 1), /byte limit/);
  assert.equal(source.body.locked, false);
});

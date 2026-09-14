#!/usr/bin/env node
/* ============================================================
   Receiptly — tests/messages-data.test.js
   ------------------------------------------------------------
   Automated coverage for js/messages-data.js (the single shared
   data model behind pages/messages.html and
   admin/admin-messages.html). This is the "testing" referenced
   in the "Message synchronization between admin and user needs
   testing" problem — it runs outside a browser, in plain Node,
   with a tiny localStorage polyfill, so it can run in CI or from
   the command line with no build step and no real browser tabs.

   Run it with:
       node tests/messages-data.test.js

   It exits non-zero (and prints which assertion failed) if
   anything regresses, and exits 0 with a summary line if every
   check passes.

   WHAT THIS DOES vs. THE MANUAL TEST PROCEDURE
   ----------------------------------------------
   The comment block at the top of js/messages-data.js describes
   a manual, two-real-tabs test procedure for the parts that only
   a real browser can exercise (actual DOM rendering, actual
   cross-tab `storage` events firing between two OS-level tabs).
   This file covers everything that sits underneath that UI: the
   data model itself, id generation, unread counting per reader,
   and the two mechanisms subscribeToChanges() uses to notice
   changes (a same-process `storage` event, and the same-tab poll
   fallback). Both should be run — this file after any change to
   messages-data.js, the manual procedure after any change to
   either messages page's markup or rendering code.
   ============================================================ */

"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

/* ---------------- minimal localStorage polyfill ---------------- */
class FakeLocalStorage {
  constructor() { this._data = new Map(); }
  getItem(key) { return this._data.has(key) ? this._data.get(key) : null; }
  setItem(key, value) { this._data.set(key, String(value)); }
  removeItem(key) { this._data.delete(key); }
  clear() { this._data.clear(); }
  key(index) { return Array.from(this._data.keys())[index] || null; }
  get length() { return this._data.size; }
}

/* ---------------- minimal window polyfill (addEventListener only) ---------------- */
function makeFakeWindow() {
  const listeners = { storage: [] };
  return {
    addEventListener(type, fn) { if (listeners[type]) listeners[type].push(fn); },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      const i = listeners[type].indexOf(fn);
      if (i >= 0) listeners[type].splice(i, 1);
    },
    // Not a real browser event; just enough shape (.key) for onStorage()
    // in messages-data.js to read.
    dispatchStorage(key) {
      listeners.storage.slice().forEach(function (fn) { fn({ key: key }); });
    }
  };
}

// Loads a FRESH copy of MessagesDB bound to the given localStorage
// instance. Two calls with the SAME localStorage instance simulate
// two different pages/tabs (admin + user) sharing one browser's
// storage but running independent copies of the module — exactly
// how it works in real life, since each HTML page loads the script
// fresh.
function loadMessagesDB(storage, win) {
  const code = fs.readFileSync(path.join(__dirname, "..", "js", "messages-data.js"), "utf8");
  const fn = new Function("window", "localStorage", code + "\n;return window.MessagesDB;");
  return fn(win, storage);
}

/* ---------------- tiny test runner ---------------- */
const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name: name, ok: true });
  } catch (e) {
    results.push({ name: name, ok: false, error: e });
  }
}

function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
const asyncTests = [];
function testAsync(name, fn) {
  asyncTests.push(
    fn().then(
      function () { results.push({ name: name, ok: true }); },
      function (e) { results.push({ name: name, ok: false, error: e }); }
    )
  );
}

/* ============================================================
   TESTS
   ============================================================ */

test("createConversation + addMessage round-trips through getMessages", function () {
  const storage = new FakeLocalStorage();
  const win = makeFakeWindow();
  const MessagesDB = loadMessagesDB(storage, win);

  const conv = MessagesDB.createConversation({ userId: "u1", subject: "Hi" });
  assert.ok(conv.id, "conversation should get an id");
  MessagesDB.addMessage(conv.id, { sender: "user", senderId: "u1", senderName: "Ada", message: "Hello" });

  const msgs = MessagesDB.getMessages(conv.id);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].message, "Hello");
  assert.strictEqual(msgs[0].conversationId, conv.id);
});

test("conversation ids never collide across two independently-loaded module instances sharing storage", function () {
  // This is the "conversation IDs must be consistent" requirement:
  // the user page and the admin page each load their own copy of
  // messages-data.js, but both must agree on the next id because
  // they both compute it from the SAME shared storage.
  const storage = new FakeLocalStorage();
  const userSideDB = loadMessagesDB(storage, makeFakeWindow());
  const adminSideDB = loadMessagesDB(storage, makeFakeWindow());

  const a = userSideDB.createConversation({ userId: "u1" });
  const b = adminSideDB.createConversation({ userId: "u2" });
  const c = userSideDB.createConversation({ userId: "u3" });

  const ids = [a.id, b.id, c.id];
  assert.strictEqual(new Set(ids).size, 3, "all three conversation ids must be unique: " + ids.join(", "));
});

test("unread counts are tracked separately per reader (one user, one admin)", function () {
  const storage = new FakeLocalStorage();
  const MessagesDB = loadMessagesDB(storage, makeFakeWindow());

  const conv = MessagesDB.createConversation({ userId: "u1" });
  MessagesDB.addMessage(conv.id, { sender: "user", senderId: "u1", senderName: "Ada", message: "question" });

  // Admin hasn't read it yet -> 1 unread for admin. User sent it themselves
  // -> 0 unread for the user (their own message doesn't count against them).
  assert.strictEqual(MessagesDB.getUnreadCount(conv.id, "admin", "admin1"), 1);
  assert.strictEqual(MessagesDB.getUnreadCount(conv.id, "user", "u1"), 0);

  MessagesDB.addMessage(conv.id, { sender: "admin", senderId: "admin1", senderName: "Support", message: "answer" });

  // Now the user has an unread admin reply, admin's own reply doesn't
  // count against admin, and admin still has the earlier unread user
  // message until they explicitly mark it read.
  assert.strictEqual(MessagesDB.getUnreadCount(conv.id, "user", "u1"), 1);
  assert.strictEqual(MessagesDB.getUnreadCount(conv.id, "admin", "admin1"), 1);

  MessagesDB.markRead(conv.id, "admin", "admin1");
  assert.strictEqual(MessagesDB.getUnreadCount(conv.id, "admin", "admin1"), 0, "admin marking read must not affect the user's unread count");
  assert.strictEqual(MessagesDB.getUnreadCount(conv.id, "user", "u1"), 1, "user's unread count is untouched by the admin's own read marker");

  MessagesDB.markRead(conv.id, "user", "u1");
  assert.strictEqual(MessagesDB.getUnreadCount(conv.id, "user", "u1"), 0);
});

test("getTotalUnread sums unread across every conversation for that reader", function () {
  const storage = new FakeLocalStorage();
  const MessagesDB = loadMessagesDB(storage, makeFakeWindow());

  const c1 = MessagesDB.createConversation({ userId: "u1" });
  const c2 = MessagesDB.createConversation({ userId: "u1" });
  MessagesDB.addMessage(c1.id, { sender: "admin", senderId: "admin1", message: "hi from c1" });
  MessagesDB.addMessage(c2.id, { sender: "admin", senderId: "admin1", message: "hi from c2" });

  assert.strictEqual(MessagesDB.getTotalUnread("user", "u1"), 2);
  MessagesDB.markRead(c1.id, "user", "u1");
  assert.strictEqual(MessagesDB.getTotalUnread("user", "u1"), 1);
});

test("sending a message re-opens a resolved/closed conversation", function () {
  const storage = new FakeLocalStorage();
  const MessagesDB = loadMessagesDB(storage, makeFakeWindow());

  const conv = MessagesDB.createConversation({ userId: "u1" });
  MessagesDB.setStatus(conv.id, "resolved");
  assert.strictEqual(MessagesDB.getConversation(conv.id).status, "resolved");

  MessagesDB.addMessage(conv.id, { sender: "user", senderId: "u1", message: "still need help" });
  assert.strictEqual(MessagesDB.getConversation(conv.id).status, "open", "a new message must reopen a resolved conversation");
});

test("legacy per-reader read-marker keys are still honored as a fallback", function () {
  // Simulates data saved by the OLD (pre-unification) code, which used
  // two different ad-hoc key patterns instead of one shared map. New
  // code must not treat already-read messages as newly unread.
  const storage = new FakeLocalStorage();
  const MessagesDB = loadMessagesDB(storage, makeFakeWindow());

  const conv = MessagesDB.createConversation({ userId: "u1" });
  MessagesDB.addMessage(conv.id, { sender: "admin", senderId: "admin1", message: "hello", createdAt: "2020-01-01T00:00:00.000Z" });

  // Manually write the OLD-style key, as the previous implementation did.
  storage.setItem("receiptly_msg_last_read__u1__" + conv.id, "2020-06-01T00:00:00.000Z");

  assert.strictEqual(MessagesDB.getUnreadCount(conv.id, "user", "u1"), 0, "pre-existing legacy read marker should still suppress the unread count");
});

test("previewText reflects the most recent message with a 'You:' prefix for admin messages", function () {
  const storage = new FakeLocalStorage();
  const MessagesDB = loadMessagesDB(storage, makeFakeWindow());

  const conv = MessagesDB.createConversation({ userId: "u1" });
  assert.strictEqual(MessagesDB.previewText(conv.id), "No messages yet");

  MessagesDB.addMessage(conv.id, { sender: "user", senderId: "u1", message: "help please" });
  assert.strictEqual(MessagesDB.previewText(conv.id), "help please");

  MessagesDB.addMessage(conv.id, { sender: "admin", senderId: "admin1", message: "sure, one sec" });
  assert.strictEqual(MessagesDB.previewText(conv.id), "You: sure, one sec");
});

testAsync("subscribeToChanges fires via the native storage-event path (cross-tab)", function () {
  const storage = new FakeLocalStorage();
  const win = makeFakeWindow();
  const MessagesDB = loadMessagesDB(storage, win);
  const conv = MessagesDB.createConversation({ userId: "u1" });

  let fired = null;
  const unsubscribe = MessagesDB.subscribeToChanges(function (change) { fired = change; }, { pollMs: 999999 });

  win.dispatchStorage("receiptly_support_messages__" + conv.id);
  unsubscribe();

  assert.ok(fired, "callback should fire on a simulated storage event");
  assert.strictEqual(fired.messagesFor, conv.id);
  return Promise.resolve();
});

testAsync("subscribeToChanges also fires via the same-tab poll fallback", function () {
  // This is the case a native `storage` event CANNOT cover: two
  // instances of the module in the SAME tab/window group (or, in
  // this test, two independently-loaded instances that never fire
  // each other's window events at all). The polling fallback is what
  // makes admin<->user sync reliable even then.
  const storage = new FakeLocalStorage();
  const senderDB = loadMessagesDB(storage, makeFakeWindow());
  const receiverWin = makeFakeWindow();
  const receiverDB = loadMessagesDB(storage, receiverWin);

  const conv = receiverDB.createConversation({ userId: "u1" });

  let fired = false;
  const unsubscribe = receiverDB.subscribeToChanges(function () { fired = true; }, { pollMs: 20 });

  // The "other tab" writes a new message directly to shared storage,
  // WITHOUT going through receiverWin at all (so the storage-event
  // path is impossible here on purpose).
  senderDB.addMessage(conv.id, { sender: "user", senderId: "u1", message: "ping" });

  return wait(80).then(function () {
    unsubscribe();
    assert.ok(fired, "poll fallback should detect the conversation change within one poll interval");
  });
});

/* ============================================================
   REPORT
   ============================================================ */
Promise.all(asyncTests).then(function () {
  const failed = results.filter(function (r) { return !r.ok; });
  results.forEach(function (r) {
    console.log((r.ok ? "  ok  - " : "  FAIL - ") + r.name);
    if (!r.ok) console.log("        " + (r.error && r.error.message || r.error));
  });
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) process.exit(1);
});

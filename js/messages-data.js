/* ============================================================
   Receiptly — js/messages-data.js
   ------------------------------------------------------------
   SINGLE SOURCE OF TRUTH for the admin <-> user messaging
   feature. Both pages/messages.html (user side) and
   admin/admin-messages.html (admin side) must load this file
   and call MessagesDB instead of touching localStorage
   directly. That is the whole point of this module: before it
   existed, each page had its own copy of the same functions
   (getTickets/saveTickets/getMessages/nextTicketId/etc). Two
   copies of the same logic drift apart over time — this file
   makes sure there is exactly one implementation, so a
   "conversation id" always means the same thing and read/unread
   state is always computed the same way on both sides.

   DATA MODEL
   ----------
   Conversation (formerly called a "ticket"):
     {
       id            "SUP-1001"  — see nextConversationId()
       userId        the account's user id (Scope.currentUserId())
       subject       string
       category      "general" | ... (only "general" is used by the
                      current UI, kept open-ended for future use)
       priority      "low" | "medium" | "high"
       status        "open" | "pending" | "in-progress" | "resolved" | "closed"
       assignedTo    admin id or null
       createdAt     ISO string
       updatedAt     ISO string
       resolvedAt    ISO string or null
       closedAt      ISO string or null
     }

   Message:
     {
       id             "msg_..."
       conversationId "SUP-1001"   (kept as `ticketId` too, see below)
       sender         "user" | "admin"
       senderId       user id or admin id
       senderName     display name at time of sending
       message        string
       createdAt      ISO string
       isInternal     bool (admin-only notes — not rendered to the user)
     }

   STORAGE KEYS (unchanged from the pre-existing implementation,
   so no migration is needed for any data already saved by an
   earlier build of this app):
     receiptly_support_tickets             -> array<Conversation>
     receiptly_support_messages__<convId>  -> array<Message>
     receiptly_msg_reads                   -> ONE object, the single
                                               source of truth for
                                               read/unread status:
                                               { "<readerType>:<readerId>:<convId>": isoTimestamp }

   Before this file existed, read status was split across two
   separate ad-hoc key patterns
   ("receiptly_msg_last_read__<userId>__<ticketId>" on the user
   side and "receiptly_admin_msg_read__<adminId>__<ticketId>" on
   the admin side). Those are still read as a one-time fallback
   (see legacyLastRead) so nobody's existing "unread" state
   suddenly resets, but every NEW read marker is written to the
   single receiptly_msg_reads object instead.

   CONVERSATION ID CONSISTENCY
   ----------------------------
   Both pages used to compute their own "next ticket id" by
   scanning receiptly_support_tickets independently. That is
   still how it works (localStorage has no atomic counter), but
   now there is exactly one function, nextConversationId(), so a
   future change to the id format only has to happen once.

   TESTING ADMIN <-> USER SYNC
   ----------------------------
   Manual test procedure (do this after any change to this file
   or to either messages page):
     1. Open pages/messages.html and admin/admin-messages.html in
        two separate browser tabs (same browser/profile, so they
        share localStorage).
     2. Send a message as the user. Within ~4s (or immediately on
        tab focus) it must appear in the admin conversation list
        with an unread badge, and inside the thread if that
        conversation is already open.
     3. Reply as the admin. The user tab must show the reply and
        the sidebar "Messages" badge must update without a
        manual refresh.
     4. Open the conversation as the user — the unread badge must
        clear. Confirm the admin's own unread count for that
        conversation is untouched by the user reading it (each
        side has its own read marker).
     5. Repeat steps 2-4 with the two pages in the SAME tab/window
        area (e.g. via two windows of the same tab group) to
        exercise the same-tab polling fallback in onChange(),
        since the native `storage` event never fires for the tab
        that made the write.
   subscribeToChanges() below is what both pages use to pass this
   test — it is the only place this sync logic is implemented.
   ============================================================ */

(function (global) {
  "use strict";

  var CONV_KEY = "receiptly_support_tickets";
  var MSG_PREFIX = "receiptly_support_messages__";
  var READS_KEY = "receiptly_msg_reads";

  function safeParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
      var v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      console.error("MessagesDB: failed to parse JSON, using fallback", e);
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("MessagesDB: failed to write '" + key + "'", e);
      return false;
    }
  }

  function makeId(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- conversations ---------------- */

  function getConversations() {
    return safeParse(localStorage.getItem(CONV_KEY), []);
  }
  function saveConversations(list) {
    return safeSet(CONV_KEY, list);
  }
  function getConversation(id) {
    return getConversations().find(function (c) { return c && c.id === id; }) || null;
  }
  function getConversationsForUser(userId) {
    return getConversations().filter(function (c) { return c && c.userId === userId; });
  }

  // ONE canonical id generator. Ids look like "SUP-1001". Both the
  // user page and the admin page call this same function, so there
  // is never a second, subtly-different id scheme to drift out of
  // sync with this one.
  function nextConversationId() {
    var list = getConversations();
    var max = 1000;
    list.forEach(function (c) {
      var n = parseInt(String(c && c.id || "").replace(/\D/g, ""), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return "SUP-" + (max + 1);
  }

  function findOpenGeneralConversationForUser(userId) {
    var mine = getConversationsForUser(userId);
    return mine.find(function (c) {
      return c.category === "general" && (c.status === "open" || c.status === "pending" || c.status === "in-progress");
    }) || null;
  }

  function createConversation(fields) {
    var now = new Date().toISOString();
    var conv = Object.assign({
      id: nextConversationId(),
      userId: null,
      subject: "Chat with Admin",
      category: "general",
      priority: "medium",
      status: "open",
      assignedTo: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      closedAt: null
    }, fields || {});
    var list = getConversations();
    list.push(conv);
    saveConversations(list);
    saveMessages(conv.id, []);
    return conv;
  }

  function updateConversation(id, patch) {
    var list = getConversations();
    var found = null;
    var next = list.map(function (c) {
      if (c && c.id === id) {
        found = Object.assign({}, c, patch, { id: c.id, updatedAt: new Date().toISOString() });
        return found;
      }
      return c;
    });
    saveConversations(next);
    return found;
  }

  function setStatus(id, status) {
    var patch = { status: status };
    if (status === "resolved") patch.resolvedAt = new Date().toISOString();
    if (status === "closed") patch.closedAt = new Date().toISOString();
    return updateConversation(id, patch);
  }

  /* ---------------- messages ---------------- */

  function getMessages(conversationId) {
    return safeParse(localStorage.getItem(MSG_PREFIX + conversationId), []);
  }
  function saveMessages(conversationId, msgs) {
    return safeSet(MSG_PREFIX + conversationId, msgs);
  }

  // The single place a chat message is ever constructed. sender must
  // be "user" or "admin". Automatically bumps the parent
  // conversation's updatedAt, re-opens it if it was resolved/closed,
  // and (for admin replies) assigns the conversation if unassigned.
  function addMessage(conversationId, fields) {
    var msg = Object.assign({
      id: makeId("msg"),
      conversationId: conversationId,
      ticketId: conversationId, // kept for backward compatibility with any older rendering code
      sender: "user",
      senderId: null,
      senderName: "",
      message: "",
      createdAt: new Date().toISOString(),
      isInternal: false
    }, fields || {});

    var msgs = getMessages(conversationId);
    msgs.push(msg);
    saveMessages(conversationId, msgs);

    var conv = getConversation(conversationId);
    if (conv) {
      var patch = {};
      if (conv.status === "resolved" || conv.status === "closed") patch.status = "open";
      if (msg.sender === "admin" && !conv.assignedTo) patch.assignedTo = msg.senderId;
      updateConversation(conversationId, patch);
    }
    return msg;
  }

  function previewText(conversationId) {
    var conv = getConversation(conversationId);
    var msgs = getMessages(conversationId);
    if (!msgs.length) return (conv && conv.message) || "No messages yet";
    var last = msgs[msgs.length - 1];
    return (last.sender === "admin" ? "You: " : "") + (last.message || "");
  }

  /* ---------------- read / unread (single source of truth) ----------------
     Every read marker, for every reader (a specific user OR a specific
     admin), lives in ONE object under READS_KEY. This replaces the two
     separate ad-hoc key-per-reader-per-conversation schemes that used
     to exist (one for users, one for admins) with one map that both
     sides read and write through the same two functions below. */

  function readKey(conversationId, readerType, readerId) {
    return readerType + ":" + readerId + ":" + conversationId;
  }

  function getReadsMap() {
    return safeParse(localStorage.getItem(READS_KEY), {});
  }

  // One-time fallback so pre-existing local data (saved by the old,
  // pre-unification key schemes) doesn't look unread again. Never
  // writes anything; getLastRead() only reads this when the new
  // unified key has nothing yet.
  function legacyLastRead(conversationId, readerType, readerId) {
    var legacyKey = readerType === "admin"
      ? "receiptly_admin_msg_read__" + readerId + "__" + conversationId
      : "receiptly_msg_last_read__" + readerId + "__" + conversationId;
    try { return localStorage.getItem(legacyKey); } catch (e) { return null; }
  }

  function getLastRead(conversationId, readerType, readerId) {
    var map = getReadsMap();
    var k = readKey(conversationId, readerType, readerId);
    if (Object.prototype.hasOwnProperty.call(map, k)) return map[k];
    return legacyLastRead(conversationId, readerType, readerId);
  }

  function markRead(conversationId, readerType, readerId) {
    var map = getReadsMap();
    map[readKey(conversationId, readerType, readerId)] = new Date().toISOString();
    safeSet(READS_KEY, map);
  }

  // Counts messages from the OTHER side (relative to readerType) that
  // are newer than this reader's own last-read marker for this
  // conversation.
  function getUnreadCount(conversationId, readerType, readerId) {
    var otherSender = readerType === "admin" ? "user" : "admin";
    var lastRead = getLastRead(conversationId, readerType, readerId);
    var msgs = getMessages(conversationId);
    var n = 0;
    msgs.forEach(function (m) {
      if (m.sender === otherSender && (!lastRead || new Date(m.createdAt) > new Date(lastRead))) n++;
    });
    return n;
  }

  function getTotalUnread(readerType, readerId, conversations) {
    var list = conversations || (readerType === "user" ? getConversationsForUser(readerId) : getConversations());
    return list.reduce(function (sum, c) { return sum + getUnreadCount(c.id, readerType, readerId); }, 0);
  }

  /* ---------------- change subscription (used by BOTH pages) ----------------
     Wraps the native `storage` event (fires in OTHER tabs only) and a
     light same-tab poll (so two open instances of this module in the
     same tab/window group still see each other's writes — this is
     the piece that used to be admin-only and is now shared, closing
     the gap that made cross-tab testing unreliable on the user side).
     Returns an unsubscribe function. */
  function subscribeToChanges(callback, options) {
    var pollMs = (options && options.pollMs) || 4000;

    // The snapshot includes each conversation's message count and last
    // message id (not just the conversation record itself), so a
    // message-only change is still detected even in the rare case
    // where it lands in the same millisecond as the conversation's
    // previous updatedAt timestamp.
    function buildSnapshot() {
      return JSON.stringify(getConversations().map(function (c) {
        var msgs = getMessages(c.id);
        var last = msgs[msgs.length - 1];
        return [c.id, c.status, c.updatedAt, msgs.length, last && last.id];
      }));
    }

    var lastSnapshot = buildSnapshot();

    function onStorage(e) {
      if (!e.key) return;
      if (e.key === CONV_KEY) {
        callback({ conversations: true, messagesFor: null });
      } else if (e.key.indexOf(MSG_PREFIX) === 0) {
        callback({ conversations: false, messagesFor: e.key.slice(MSG_PREFIX.length) });
      } else if (e.key === READS_KEY) {
        callback({ conversations: true, messagesFor: null });
      }
    }
    window.addEventListener("storage", onStorage);

    var timer = setInterval(function () {
      var fresh = buildSnapshot();
      if (fresh !== lastSnapshot) {
        lastSnapshot = fresh;
        callback({ conversations: true, messagesFor: null });
      }
    }, pollMs);

    return function unsubscribe() {
      window.removeEventListener("storage", onStorage);
      clearInterval(timer);
    };
  }

  global.MessagesDB = {
    // conversations
    getConversations: getConversations,
    getConversation: getConversation,
    getConversationsForUser: getConversationsForUser,
    findOpenGeneralConversationForUser: findOpenGeneralConversationForUser,
    createConversation: createConversation,
    updateConversation: updateConversation,
    setStatus: setStatus,
    nextConversationId: nextConversationId,

    // messages
    getMessages: getMessages,
    addMessage: addMessage,
    previewText: previewText,

    // read / unread
    markRead: markRead,
    getLastRead: getLastRead,
    getUnreadCount: getUnreadCount,
    getTotalUnread: getTotalUnread,

    // sync
    subscribeToChanges: subscribeToChanges
  };
})(window);

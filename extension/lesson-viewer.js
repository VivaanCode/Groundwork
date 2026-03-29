(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function fromBase64UrlJson(b64url) {
    const b64 = String(b64url || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  }

  function getLessonFromHash() {
    const raw = location.hash ? location.hash.slice(1) : "";
    const m = raw.match(/(?:^|[&?])lesson=([^&]+)/);
    if (!m || !m[1]) return null;
    try {
      const encoded = decodeURIComponent(m[1]);
      const parsed = fromBase64UrlJson(encoded);
      if (!parsed || typeof parsed !== "object") return null;
      const ver = Number(parsed.version != null ? parsed.version : parsed.v);
      if (ver !== 3) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function normalizeLesson(raw) {
    const links = Array.isArray(raw.links) ? raw.links : [];
    const out = [];
    for (let i = 0; i < links.length && out.length < 40; i++) {
      const L = links[i];
      if (!L || typeof L !== "object") continue;
      const url = String(L.url || "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({
        title: String(L.title || "").trim() || url.replace(/^https?:\/\//i, "").slice(0, 80),
        url: url,
      });
    }
    return {
      version: 3,
      title: String(raw.title || "Lesson").trim() || "Lesson",
      contextUrl: String(raw.contextUrl || "").trim(),
      contextTitle: String(raw.contextTitle || "").trim(),
      links: out,
      aiPrompt: String(raw.aiPrompt || "").trim(),
    };
  }

  function buildSystemMessage(lesson) {
    const resourceBlock =
      lesson.links.length > 0
        ? lesson.links
            .map(function (L, i) {
              return (i + 1).toString() + ". " + L.title + " — " + L.url;
            })
            .join("\n")
        : "(No links were provided; help generally with the topic using the context page below.)";

    const ctx =
      lesson.contextUrl || lesson.contextTitle
        ? "Teacher context page: " +
          (lesson.contextTitle || "(untitled)") +
          "\nURL: " +
          (lesson.contextUrl || "(unknown)")
        : "No specific class page URL was attached.";

    const tuning =
      lesson.aiPrompt ||
      "You are a clear, friendly tutor. Keep answers short and accurate. If you do not know, say so.";

    return (
      "You are the ClassLoop lesson assistant for students.\n\n" +
      ctx +
      "\n\nTeacher instructions for how you should behave:\n" +
      tuning +
      "\n\nApproved resources (only reference these URLs; do not invent links):\n" +
      resourceBlock +
      "\n\nAnswer student questions about the lesson topic and these resources. Be kind, concise, and age-appropriate."
    );
  }

  function appendBubble(role, text) {
    const log = $("chatLog");
    const div = document.createElement("div");
    div.className = "bubble " + role;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function setChatStatus(msg, isErr) {
    const el = $("chatStatus");
    el.textContent = msg || "";
    el.className = "status" + (isErr ? " err" : "");
  }

  var lesson = null;
  var historyMsgs = [];

  function renderResources() {
    const list = $("resourceList");
    const empty = $("resourcesEmpty");
    list.innerHTML = "";
    if (!lesson.links.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    lesson.links.forEach(function (L) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = L.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      const titleEl = document.createElement("span");
      titleEl.className = "link-title";
      titleEl.textContent = L.title;
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = L.url;
      a.append(titleEl, sub);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function boot() {
    const raw = getLessonFromHash();
    if (!raw) {
      $("lessonTitle").textContent = "Lesson not found";
      $("contextLine").textContent = "Open this page from a valid ClassLoop lesson link.";
      $("resourcesEmpty").textContent = "Invalid or missing lesson data in the URL.";
      $("chatForm").classList.add("hidden");
      return;
    }

    lesson = normalizeLesson(raw);
    $("lessonTitle").textContent = lesson.title;

    if (lesson.contextUrl || lesson.contextTitle) {
      $("contextLine").textContent =
        "Tied to: " +
        (lesson.contextTitle || "Class page") +
        (lesson.contextUrl ? " · " + lesson.contextUrl : "");
    } else {
      $("contextLine").textContent = "Shared lesson resources and AI help.";
    }

    renderResources();

    historyMsgs = [
      {
        role: "system",
        content: buildSystemMessage(lesson),
      },
    ];

    $("chatForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      const input = $("chatInput");
      const text = (input.value || "").trim();
      if (!text) return;

      appendBubble("user", text);
      input.value = "";
      setChatStatus("Thinking…", false);
      $("btnSend").disabled = true;

      const userMsg = { role: "user", content: text };
      historyMsgs.push(userMsg);

      const payload = historyMsgs.map(function (m) {
        return { role: m.role, content: m.content };
      });

      chrome.runtime
        .sendMessage({
          type: "GL_FEATHERLESS_CHAT",
          messages: payload,
          temperature: 0.45,
          max_tokens: 2048,
          top_p: 0.9,
          top_k: 40,
        })
        .then(function (res) {
          $("btnSend").disabled = false;
          if (!res || !res.ok) {
            historyMsgs.pop();
            appendBubble("err", (res && res.error) || "Could not reach the AI. Check your API key in extension options.");
            setChatStatus("", false);
            return;
          }
          const reply = String(res.content || "").trim() || "(Empty reply.)";
          historyMsgs.push({ role: "assistant", content: reply });
          appendBubble("assistant", reply);
          setChatStatus("", false);
        })
        .catch(function () {
          $("btnSend").disabled = false;
          historyMsgs.pop();
          appendBubble("err", "Something went wrong. Try again.");
          setChatStatus("", false);
        });
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

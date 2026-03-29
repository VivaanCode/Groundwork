const STORAGE_LESSON = "lessonDraftV1";

const DEFAULT_AI_PROMPT =
  "You are a clear, friendly tutor for students. Keep answers short and practical. Point them to the teacher’s links when relevant. If you are unsure, say so.";

function gid() {
  return "l_" + Math.random().toString(36).slice(2, 11);
}

function $(id) {
  return document.getElementById(id);
}

let lesson = emptyLessonV3();
let launchContext = { sourceUrl: "", sourceTitle: "" };
let saveTimer = null;

function emptyLessonV3() {
  return {
    version: 3,
    title: "",
    contextUrl: "",
    contextTitle: "",
    links: [],
    aiPrompt: DEFAULT_AI_PROMPT,
  };
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    void saveState();
  }, 280);
}

async function saveState() {
  lesson.updatedAt = Date.now();
  await chrome.storage.local.set({ [STORAGE_LESSON]: lesson });
}

function normalizeLink(row) {
  return {
    id: row.id || gid(),
    title: String(row.title || "").trim(),
    url: String(row.url || "").trim(),
  };
}

function migrateLesson(raw) {
  if (!raw || typeof raw !== "object") {
    return emptyLessonV3();
  }
  if (Number(raw.version) === 3) {
    const L = emptyLessonV3();
    L.title = String(raw.title || "");
    L.contextUrl = String(raw.contextUrl || "");
    L.contextTitle = String(raw.contextTitle || "");
    L.aiPrompt = String(raw.aiPrompt || "").trim() || DEFAULT_AI_PROMPT;
    L.links = Array.isArray(raw.links)
      ? raw.links.map(normalizeLink).filter(function (x) {
          return x.url.length > 0;
        })
      : [];
    return L;
  }

  const out = emptyLessonV3();
  out.title = String(raw.title || "");

  if (Array.isArray(raw.resources)) {
    for (let i = 0; i < raw.resources.length; i++) {
      const r = raw.resources[i];
      if (!r || r.kind !== "link") continue;
      const url = String(r.url || "").trim();
      if (!url) continue;
      out.links.push(
        normalizeLink({
          id: r.id || gid(),
          title: r.title || "",
          url: url,
        }),
      );
    }
  }

  if (!out.links.length && Array.isArray(raw.blocks)) {
    for (let j = 0; j < raw.blocks.length; j++) {
      const b = raw.blocks[j];
      if (!b || b.type !== "resource" || b.resourceKind !== "link") continue;
      const url = String(b.url || "").trim();
      if (!url) continue;
      out.links.push(
        normalizeLink({
          id: b.id || gid(),
          title: b.title || "",
          url: url,
        }),
      );
    }
  }

  var persona = typeof raw.aiPersona === "string" ? raw.aiPersona.trim() : "";
  var task = typeof raw.aiTask === "string" ? raw.aiTask.trim() : "";
  if (persona || task) {
    out.aiPrompt = [persona && "Style / role:\n" + persona, task && "Default task:\n" + task].filter(Boolean).join("\n\n");
  }

  return out;
}

function setStatus(msg, isErr) {
  const el = $("statusLine");
  el.textContent = msg || "";
  el.className = "status" + (isErr ? " err" : "");
}

function toBase64UrlJson(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function stripUrlHash(u) {
  return String(u || "").replace(/#.*$/, "");
}

function buildPortableLessonForShare() {
  const ctxUrl = launchContext.sourceUrl || lesson.contextUrl || "";
  const ctxTitle = launchContext.sourceTitle || lesson.contextTitle || "";
  const links = [];
  for (let i = 0; i < lesson.links.length && links.length < 36; i++) {
    var L = lesson.links[i];
    if (!L) continue;
    var url = String(L.url || "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    var title = String(L.title || "").trim();
    links.push({
      title: title || url.replace(/^https?:\/\//i, "").slice(0, 96),
      url: url.slice(0, 2048),
    });
  }
  var prompt = String($("aiPrompt").value || lesson.aiPrompt || "").trim() || DEFAULT_AI_PROMPT;
  return {
    version: 3,
    v: 3,
    title: String($("lessonTitle").value || lesson.title || "").trim() || "Lesson",
    contextUrl: stripUrlHash(ctxUrl).slice(0, 2048),
    contextTitle: String(ctxTitle || "").slice(0, 240),
    links: links,
    aiPrompt: prompt.slice(0, 6000),
  };
}

function buildLessonShareUrl() {
  const portable = buildPortableLessonForShare();
  const payload = toBase64UrlJson(portable);
  const ctxBase = stripUrlHash(portable.contextUrl || "").trim();
  const firstLink = portable.links[0] ? String(portable.links[0].url).trim() : "";
  const launch =
    /^https?:\/\//i.test(ctxBase) ? ctxBase : /^https?:\/\//i.test(firstLink) ? stripUrlHash(firstLink) : "";

  if (payload.length > 5200 || !launch) {
    return (
      chrome.runtime.getURL("lesson-viewer.html") + "#lesson=" + encodeURIComponent(payload)
    );
  }

  const sep = launch.indexOf("#") >= 0 ? "&" : "#";
  return launch + sep + "cllesson=" + encodeURIComponent(payload);
}

async function maybeShortenUrl(longUrl) {
  if (!/^https?:\/\//i.test(longUrl || "")) return longUrl;
  try {
    const res = await chrome.runtime.sendMessage({ type: "GL_SHORTEN_URL", url: longUrl });
    if (res && res.ok && res.shortUrl) return res.shortUrl;
  } catch {}
  return longUrl;
}

function renderLinkRows() {
  const host = $("linkRows");
  host.innerHTML = "";

  if (!lesson.links.length) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = "No links yet — click “Add link”.";
    host.appendChild(p);
    return;
  }

  lesson.links.forEach(function (row, idx) {
    const wrap = document.createElement("div");
    wrap.className = "link-row";

    const labUrl = document.createElement("label");
    labUrl.textContent = "URL";
    const urlIn = document.createElement("input");
    urlIn.type = "url";
    urlIn.placeholder = "https://…";
    urlIn.value = row.url || "";
    urlIn.addEventListener("input", function () {
      lesson.links[idx].url = urlIn.value;
      scheduleSave();
    });

    const labTitle = document.createElement("label");
    labTitle.textContent = "Label (optional)";
    const titleIn = document.createElement("input");
    titleIn.type = "text";
    titleIn.placeholder = "e.g. Reading, Video, Worksheet";
    titleIn.value = row.title || "";
    titleIn.addEventListener("input", function () {
      lesson.links[idx].title = titleIn.value;
      scheduleSave();
    });

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", function () {
      lesson.links.splice(idx, 1);
      renderLinkRows();
      scheduleSave();
    });
    actions.appendChild(removeBtn);

    wrap.append(labUrl, urlIn, labTitle, titleIn, actions);
    host.appendChild(wrap);
  });
}

function loadLaunchContext(ctx) {
  const el = $("launchCtx");
  if (ctx && ctx.sourceUrl) {
    launchContext = { sourceUrl: ctx.sourceUrl || "", sourceTitle: ctx.sourceTitle || "" };
    lesson.contextUrl = lesson.contextUrl || launchContext.sourceUrl;
    lesson.contextTitle = lesson.contextTitle || launchContext.sourceTitle;
    var s = String(ctx.sourceUrl).replace(/^https?:\/\//, "");
    el.textContent =
      "Class page: " +
      (ctx.sourceTitle || "Tab") +
      " · " +
      s.slice(0, 52) +
      (s.length > 52 ? "…" : "");
  } else {
    el.textContent = "Open the editor from the extension popup on a class webpage to attach this lesson to that site.";
  }
}

async function loadState() {
  const data = await chrome.storage.local.get([STORAGE_LESSON, "lessonEditorLaunchContext"]);
  lesson = migrateLesson(data[STORAGE_LESSON]);
  loadLaunchContext(data.lessonEditorLaunchContext);
  $("lessonTitle").value = lesson.title || "";
  $("aiPrompt").value = lesson.aiPrompt || DEFAULT_AI_PROMPT;
  renderLinkRows();
}

$("lessonTitle").addEventListener("input", function (ev) {
  lesson.title = ev.target.value;
  scheduleSave();
});

$("aiPrompt").addEventListener("input", function (ev) {
  lesson.aiPrompt = ev.target.value;
  scheduleSave();
});

$("btnAddLink").addEventListener("click", function () {
  lesson.links.push(normalizeLink({ id: gid(), title: "", url: "https://" }));
  renderLinkRows();
  scheduleSave();
});

$("btnSave").addEventListener("click", function () {
  void saveState().then(function () {
    setStatus("Saved.", false);
  });
});

$("btnCopyShare").addEventListener("click", async function () {
  try {
    var longUrl = buildLessonShareUrl();
    var shareUrl = await maybeShortenUrl(longUrl);
    $("shareHint").textContent =
      /^chrome-extension:\/\//i.test(longUrl) || longUrl.length > 2000
        ? "Students need this extension installed. This link opens the full lesson hub page inside ClassLoop."
        : "Students open the link (extension installed once). The page stays visible; resources open inside the panel preview (same tab). They can collapse the rail so the site reflows.";

    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Student link copied" + (shareUrl !== longUrl ? " (short URL)." : "."), false);
    } catch {
      var shown = window.prompt("Copy this student link:", shareUrl);
      if (shown !== null) setStatus("Link ready.", false);
    }
  } catch (e) {
    setStatus("Share failed: " + (e && e.message ? e.message : String(e)), true);
  }
});

void loadState().then(function () {
  if (!lesson.links.length) {
    $("shareHint").textContent =
      "Add HTTPS links, tune the AI, then copy a student link. They get a panel on your class page (optional is.gd short URL).";
  }
});

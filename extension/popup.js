const GL_START_INTERACTIVE_GUIDE = "GL_START_INTERACTIVE_GUIDE";
const GL_STOP_INTERACTIVE_GUIDE = "GL_STOP_INTERACTIVE_GUIDE";
const GL_COMPILE_INTERACTIVE_GUIDE = "GL_COMPILE_INTERACTIVE_GUIDE";
const GL_CAPTURE_SOURCE_SNAPSHOT = "GL_CAPTURE_SOURCE_SNAPSHOT";
const GL_GUIDE_SESSION_START = "GL_GUIDE_SESSION_START";
const GL_GUIDE_SESSION_STATUS = "GL_GUIDE_SESSION_STATUS";
const GL_GUIDE_SESSION_FINALIZE = "GL_GUIDE_SESSION_FINALIZE";

const STORAGE_LAST_GUIDE = "classLoopLastCompiledGuide";
const COMPILE_SCRATCH_KEY = "classLoopPendingCompilePayload";
const COMPILE_INLINE_MAX_CHARS = 800000;

let localRecordingState = null;

function $(id) {
  return document.getElementById(id);
}

function tabBlocked(url) {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools://")
  );
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToTab(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg);
}

function toBase64UrlJson(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildPortableGuideForUrl(guide) {
  const g = guide && typeof guide === "object" ? guide : {};
  const steps = Array.isArray(g.steps) ? g.steps : [];
  return {
    version: 2,
    title: g.title || "Interactive Guide",
    sourceTitle: g.sourceTitle || "",
    sourceUrl: g.sourceUrl || "",
    routeUrls: Array.isArray(g.routeUrls) ? g.routeUrls.slice(0, 30) : [],
    steps: steps.slice(0, 120).map(function (s, i) {
      return {
        title: s && s.title ? s.title : "Step " + (i + 1),
        studentText: s && s.studentText ? s.studentText : "",
        teacherTip: s && s.teacherTip ? s.teacherTip : "",
        targetSelector: (s && s.targetSelector) || "",
        pageUrl: (s && s.pageUrl) || "",
        scroll: (s && s.scroll) || { targetSelector: null, ratioX: 0, ratioY: 0 },
        clickX: s && Number.isFinite(s.clickX) ? s.clickX : 0,
        clickY: s && Number.isFinite(s.clickY) ? s.clickY : 0,
        zoomScale: s && Number.isFinite(s.zoomScale) ? s.zoomScale : 1.08,
      };
    }),
  };
}

function buildGuideViewerUrl(guide) {
  const portable = buildPortableGuideForUrl(guide);
  const payload = toBase64UrlJson(portable);
  const firstRoute =
    Array.isArray(portable.routeUrls) && portable.routeUrls[0] ? String(portable.routeUrls[0]).trim() : "";
  const step0 = portable.steps && portable.steps[0] ? portable.steps[0] : null;
  const src =
    firstRoute ||
    (step0 && typeof step0.pageUrl === "string" && step0.pageUrl.trim()) ||
    (typeof portable.sourceUrl === "string" && portable.sourceUrl.trim()) ||
    "";
  if (/^https?:\/\//i.test(src)) {
    const sep = src.indexOf("#") >= 0 ? "&" : "#";
    return src + sep + "clguide=" + encodeURIComponent(payload);
  }
  return chrome.runtime.getURL("guide-viewer.html") + "#guide=" + payload;
}

async function maybeShortenUrl(longUrl) {
  if (!/^https?:\/\//i.test(longUrl || "")) return longUrl;
  try {
    const res = await chrome.runtime.sendMessage({ type: "GL_SHORTEN_URL", url: longUrl });
    if (res && res.ok && res.shortUrl) return res.shortUrl;
  } catch {}
  return longUrl;
}

function setStatus(text, kind) {
  const el = $("statusLine");
  el.textContent = text || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function setRecordButtonState(isRecording, blocked) {
  const btn = $("btnToggleGuide");
  btn.classList.toggle("recording", !!isRecording);
  btn.textContent = isRecording ? "Stop & compile" : "Start recording";
  btn.disabled = !isRecording && !!blocked;
  $("subLine").textContent = isRecording
    ? "Recording is active now. Click again to stop and compile."
    : "Start recording, stop & compile, then share.";
}

async function refresh() {
  const tab = await getActiveTab();
  const blocked = !tab || tab.id == null || tabBlocked(tab.url || "");

  let sessionStatus = null;
  try {
    sessionStatus = await chrome.runtime.sendMessage({ type: GL_GUIDE_SESSION_STATUS });
  } catch {
    sessionStatus = null;
  }
  const activeFromBg = !!(sessionStatus && sessionStatus.ok && sessionStatus.active);
  const active = localRecordingState == null ? activeFromBg : localRecordingState;
  if (localRecordingState != null && localRecordingState === activeFromBg) {
    localRecordingState = null;
  }
  setRecordButtonState(active, blocked);

  const data = await chrome.storage.local.get(STORAGE_LAST_GUIDE);
  const hasGuide = !!(data[STORAGE_LAST_GUIDE] && data[STORAGE_LAST_GUIDE].guide);
  $("btnShareGuideUrl").disabled = !hasGuide;

  const steps = hasGuide ? (data[STORAGE_LAST_GUIDE].guide.steps || []).length : 0;
  $("metaLine").textContent =
    (blocked ? "Open a normal webpage to record." : active ? "Recording in progress." : "Ready.") +
    (steps ? " Last guide: " + steps + " steps." : "");
}

function buildLocalFallback(payload) {
  var sourceTitle = (payload && payload.sourceTitle) || "Interactive Guide";
  var sourceUrl = (payload && payload.sourceUrl) || "";
  var steps = [];
  var guideSteps = Array.isArray(payload && payload.guideSteps) ? payload.guideSteps : [];
  for (var i = 0; i < guideSteps.length && steps.length < 30; i++) {
    var gs = guideSteps[i];
    if (!gs) continue;
    var hint = (gs.stepSummary && String(gs.stepSummary).trim()) ||
      (gs.elementText && String(gs.elementText).trim().length > 3 ? String(gs.elementText).trim() : "") ||
      (gs.elementLabel && !["p","div","span","section","header","footer","nav","article"].includes(String(gs.elementLabel).toLowerCase()) ? String(gs.elementLabel).trim() : "") ||
      "";
    var label = hint || "this area on the page";
    var shortHint = label.length > 40 ? label.slice(0, 37) + "…" : label;
    steps.push({
      title: "Step " + (steps.length + 1) + (hint ? ": " + shortHint : ""),
      studentText: "Spend a moment with " + label + ", then click the highlight to move forward.",
      teacherTip: hint ? "About: " + hint.slice(0, 100) : "From your click sequence.",
      targetSelector: gs.targetSelector || "",
      pageUrl: gs.pageUrl || sourceUrl,
      scroll: gs.scroll || { targetSelector: null, ratioX: 0, ratioY: 0 },
      clickX: Number.isFinite(gs.clientX) ? gs.clientX : 0,
      clickY: Number.isFinite(gs.clientY) ? gs.clientY : 0,
      zoomScale: Number.isFinite(gs.zoomScale) ? gs.zoomScale : 1.08,
    });
  }
  if (!steps.length) {
    var evs = Array.isArray(payload && payload.events) ? payload.events : [];
    for (var j = 0; j < evs.length && steps.length < 30; j++) {
      var ev = evs[j];
      if (!ev) continue;
      if (ev.type === "point") {
        steps.push({
          title: "Step " + (steps.length + 1),
          studentText: "Click the highlighted point to continue.",
          teacherTip: "Auto-generated from click.",
          targetSelector: ev.targetSelector || "",
          pageUrl: sourceUrl,
          scroll: { targetSelector: null, ratioX: 0, ratioY: 0 },
          clickX: Number.isFinite(ev.clientX) ? ev.clientX : 0,
          clickY: Number.isFinite(ev.clientY) ? ev.clientY : 0,
          zoomScale: 1.12,
        });
      } else if (ev.type === "input") {
        var fld = ev.fieldLabel || "input field";
        var val = ev.valueSnippet ? String(ev.valueSnippet).trim() : "";
        steps.push({
          title: "Step " + (steps.length + 1),
          studentText: val ? "Type \"" + val.slice(0, 42) + "\" in " + fld + "." : "Type in " + fld + ".",
          teacherTip: "Auto-generated from typed input.",
          targetSelector: ev.targetSelector || "",
          pageUrl: sourceUrl,
          scroll: { targetSelector: null, ratioX: 0, ratioY: 0 },
          clickX: 0,
          clickY: 0,
          zoomScale: 1.12,
        });
      }
    }
  }
  if (!steps.length) {
    steps.push({
      title: "Step 1",
      studentText: "Follow highlighted targets to continue.",
      teacherTip: "Fallback guide.",
    });
  }
  return {
    ok: true,
    guideId: "guide_local_" + Date.now().toString(36),
    guide: {
      version: 2,
      title: sourceTitle,
      sourceTitle: sourceTitle,
      sourceUrl: sourceUrl,
      routeUrls: Array.isArray(payload && payload.routeUrls) ? payload.routeUrls.slice(0, 30) : [],
      steps: steps,
    },
  };
}

async function startRecording() {
  const tab = await getActiveTab();
  if (!tab || tab.id == null || tabBlocked(tab.url || "")) {
    setStatus("Open a normal webpage first.", "err");
    return;
  }
  try {
    localRecordingState = true;
    setRecordButtonState(true, false);
    setStatus("Recording started.", "ok");
    await sendToTab(tab.id, { type: GL_START_INTERACTIVE_GUIDE });
    await chrome.runtime.sendMessage({
      type: GL_GUIDE_SESSION_START,
      tabId: tab.id,
      sourceUrl: tab.url || "",
      sourceTitle: tab.title || "",
    });
  } catch {
    localRecordingState = false;
    setRecordButtonState(false, false);
    setStatus("Could not start. Reload page and try again.", "err");
  }
}

async function stopAndCompile() {
  const tab = await getActiveTab();
  localRecordingState = false;
  setRecordButtonState(false, false);
  setStatus("Compiling...", "");

  var contentPayload = null;
  if (tab && tab.id != null && !tabBlocked(tab.url || "")) {
    try {
      var stopRes = await sendToTab(tab.id, { type: GL_STOP_INTERACTIVE_GUIDE });
      if (stopRes && stopRes.ok && stopRes.payload) contentPayload = stopRes.payload;
    } catch {}
  }

  await new Promise(function (r) { setTimeout(r, 650); });

  let payload = null;
  try {
    const fin = await chrome.runtime.sendMessage({ type: GL_GUIDE_SESSION_FINALIZE });
    if (fin && fin.ok && fin.payload) payload = fin.payload;
  } catch {}

  if (payload && contentPayload) {
    if ((!Array.isArray(payload.guideSteps) || !payload.guideSteps.length) &&
        Array.isArray(contentPayload.guideSteps) && contentPayload.guideSteps.length) {
      payload.guideSteps = contentPayload.guideSteps;
    }
    if ((!Array.isArray(payload.events) || !payload.events.length) &&
        Array.isArray(contentPayload.events) && contentPayload.events.length) {
      payload.events = contentPayload.events;
    }
  }
  if (!payload && contentPayload) {
    payload = contentPayload;
    if (!payload.routeUrls) payload.routeUrls = [];
  }

  var hasEvents = payload && Array.isArray(payload.events) && payload.events.length > 0;
  var hasSteps = payload && Array.isArray(payload.guideSteps) && payload.guideSteps.length > 0;
  if (!payload || (!hasEvents && !hasSteps)) {
    setStatus("No capture data found.", "err");
    return;
  }

  let compiled = null;
  let usedScratch = false;
  try {
    const raw = JSON.stringify(payload);
    let msg;
    if (raw.length > COMPILE_INLINE_MAX_CHARS) {
      usedScratch = true;
      await chrome.storage.local.set({ [COMPILE_SCRATCH_KEY]: payload });
      msg = { type: GL_COMPILE_INTERACTIVE_GUIDE, fromScratchKey: true };
    } else {
      msg = { type: GL_COMPILE_INTERACTIVE_GUIDE, payload: payload };
    }
    compiled = await chrome.runtime.sendMessage(msg);
  } catch {
    compiled = null;
  } finally {
    if (usedScratch) await chrome.storage.local.remove(COMPILE_SCRATCH_KEY);
  }
  if (!compiled || !compiled.ok || !compiled.guide) {
    compiled = buildLocalFallback(payload);
  }

  await chrome.storage.local.set({
    [STORAGE_LAST_GUIDE]: {
      guideId: compiled.guideId,
      guide: compiled.guide,
      savedAt: Date.now(),
    },
  });
  setStatus("Guide done.", "ok");
}

async function copyShareUrl() {
  const data = await chrome.storage.local.get(STORAGE_LAST_GUIDE);
  const pack = data[STORAGE_LAST_GUIDE];
  if (!pack || !pack.guide) {
    setStatus("No saved guide yet.", "err");
    return;
  }
  try {
    const longUrl = buildGuideViewerUrl(pack.guide);
    const shareUrl = await maybeShortenUrl(longUrl);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Share URL copied.", "ok");
    } catch {
      const shown = window.prompt("Copy this guide URL:", shareUrl);
      if (shown !== null) setStatus("Share URL ready.", "ok");
    }
  } catch (e) {
    setStatus("Share failed: " + (e && e.message ? e.message : String(e)), "err");
  }
}

async function openGuideEditor() {
  const tab = await getActiveTab();
  let previewDataUrl = "";
  try {
    if (tab && typeof tab.windowId === "number") {
      previewDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 72 });
    }
  } catch {
    previewDataUrl = "";
  }
  if (!previewDataUrl && tab && tab.id != null) {
    try {
      const snapRes = await sendToTab(tab.id, { type: GL_CAPTURE_SOURCE_SNAPSHOT });
      if (snapRes && snapRes.ok && snapRes.dataUrl) previewDataUrl = snapRes.dataUrl;
    } catch {
      previewDataUrl = "";
    }
  }
  await chrome.storage.local.set({
    lessonEditorLaunchContext: {
      sourceUrl: tab && tab.url ? tab.url : "",
      sourceTitle: tab && tab.title ? tab.title : "",
      previewDataUrl: previewDataUrl,
      savedAt: Date.now(),
    },
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL("lesson-editor.html") });
}

function wireUi() {
  $("btnToggleGuide").addEventListener("click", async function () {
    let st = null;
    try {
      st = await chrome.runtime.sendMessage({ type: GL_GUIDE_SESSION_STATUS });
    } catch {
      st = null;
    }
    const active = !!(st && st.ok && st.active);
    if (active || localRecordingState === true) await stopAndCompile();
    else await startRecording();
    await refresh();
  });

  $("btnShareGuideUrl").addEventListener("click", async function () {
    await copyShareUrl();
    await refresh();
  });

  $("btnGuideEditor").addEventListener("click", async function () {
    await openGuideEditor();
  });

  $("btnOptions").addEventListener("click", function () {
    chrome.runtime.openOptionsPage();
  });

  $("btnRefresh").addEventListener("click", function () {
    void refresh();
  });
}

document.addEventListener("DOMContentLoaded", function () {
  wireUi();
  void refresh();
  setInterval(function () {
    void refresh();
  }, 1200);
});

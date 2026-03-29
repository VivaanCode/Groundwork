const STORAGE_KEYS = {
  apiBaseUrl: "guidedLessonApiBaseUrl",
};

const FEATHERLESS = {
  apiKey: "featherlessApiKey",
  model: "featherlessModel",
  guideModel: "featherlessGuideModel",
  apiBase: "featherlessApiBase",
  aiDefaultOn: "featherlessAiDefaultOn",
};

const FEATHERLESS_DEFAULT_MODEL = "moonshotai/Kimi-K2.5";
const FEATHERLESS_DEFAULT_GUIDE_MODEL = "Qwen/Qwen2.5-7B-Instruct";
const FEATHERLESS_DEFAULT_API_ROOT = "https://api.featherless.ai/v1";
const GUIDE_CAPTURE_STATE_KEY = "classLoopGuideCaptureState";
const GUIDE_CAPTURE_AGG_KEY = "classLoopGuideCaptureAggregate";

async function getFeatherlessApiRoot() {
  const d = await chrome.storage.local.get(FEATHERLESS.apiBase);
  let u = d[FEATHERLESS.apiBase];
  if (typeof u !== "string" || !u.trim()) {
    return FEATHERLESS_DEFAULT_API_ROOT;
  }
  u = u.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(u)) {
    return FEATHERLESS_DEFAULT_API_ROOT;
  }
  return u;
}

async function getApiBaseUrl() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.apiBaseUrl);
  const url = data[STORAGE_KEYS.apiBaseUrl];
  return typeof url === "string" && url.length > 0 ? url.replace(/\/$/, "") : "http://localhost:3000";
}

async function postToBackend(path, body) {
  const base = await getApiBaseUrl();
  const target = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
    });
  } catch {
    // Backend may be offline during local dev.
  }
}

async function getFeatherlessKey() {
  const d = await chrome.storage.local.get(FEATHERLESS.apiKey);
  const k = d[FEATHERLESS.apiKey];
  return typeof k === "string" ? k.trim() : "";
}

async function getFeatherlessModel() {
  const d = await chrome.storage.local.get(FEATHERLESS.model);
  const m = d[FEATHERLESS.model];
  return typeof m === "string" && m.length ? m : FEATHERLESS_DEFAULT_MODEL;
}

async function getGuideCompileModel() {
  const d = await chrome.storage.local.get(FEATHERLESS.guideModel);
  const m = d[FEATHERLESS.guideModel];
  if (typeof m === "string" && m.trim()) return m.trim();
  return FEATHERLESS_DEFAULT_GUIDE_MODEL;
}

function isKimiModel(model) {
  return typeof model === "string" && /kimi/i.test(model);
}

/** OpenAI-style body; Kimi gets top_p + top_k (Featherless/Moonshot-style sampling). */
function buildFeatherlessCompletionBody(model, messages, sampler) {
  const body = {
    model: model,
    messages: messages,
    temperature: sampler.temperature,
    max_tokens: sampler.max_tokens,
    top_p: sampler.top_p != null ? sampler.top_p : 0.95,
  };
  if (isKimiModel(model)) {
    body.top_k = sampler.top_k != null ? sampler.top_k : 40;
  }
  return body;
}

function completionTextFromResponse(data) {
  const choice = data.choices && data.choices[0];
  const msg = choice && choice.message;
  if (!msg) return "";
  let text = "";
  if (typeof msg.content === "string") {
    text = msg.content;
  } else if (Array.isArray(msg.content)) {
    for (let i = 0; i < msg.content.length; i++) {
      const p = msg.content[i];
      if (p && p.type === "text" && typeof p.text === "string") {
        text += (text ? "\n" : "") + p.text;
      }
    }
  }
  if (!String(text).trim() && typeof msg.reasoning_content === "string") {
    text = msg.reasoning_content;
  }
  return text;
}

/** Default max output tokens; Featherless clamps to each model's max_completion_tokens. */
async function featherlessChat({
  messages,
  model,
  temperature = 0.5,
  max_tokens = 8192,
  top_p,
  top_k,
  timeoutMs = 180000,
}) {
  const key = await getFeatherlessKey();
  if (!key) {
    return { ok: false, error: "Missing Featherless API key. Open the extension options page." };
  }
  const chosenModel = typeof model === "string" && model.trim() ? model.trim() : await getFeatherlessModel();
  const apiRoot = await getFeatherlessApiRoot();
  const url = apiRoot + "/chat/completions";
  const body = buildFeatherlessCompletionBody(chosenModel, messages, {
    temperature: temperature,
    max_tokens: max_tokens,
    top_p: top_p,
    top_k: top_k,
  });

  const headers = {
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Title": "ClassLoop Guided Lesson",
  };

  const ctrl = new AbortController();
  const timer = setTimeout(function () {
    ctrl.abort();
  }, timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: "omit",
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    const name = e && e.name;
    if (name === "AbortError") {
      return {
        ok: false,
        error:
          "Request timed out after " +
          Math.round(timeoutMs / 1000) +
          "s. Try a shorter recording or increase timeout in code.",
      };
    }
    const raw = (e && e.message) || String(e);
    if (/failed to fetch|networkerror|load failed/i.test(raw)) {
      return {
        ok: false,
        error:
          raw +
          " — check internet/VPN/DNS and api.featherless.ai. If the recording was long, pointer events are now stripped automatically; reload the extension and try again.",
      };
    }
    return { ok: false, error: raw };
  }
  clearTimeout(timer);

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 500) };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: (data.error && data.error.message) || text.slice(0, 500),
    };
  }
  const content = completionTextFromResponse(data);
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, error: "Empty completion (no content or reasoning_content)." };
  }
  return { ok: true, content: content };
}

function extractJsonObject(s) {
  if (!s || typeof s !== "string") return null;
  var start = s.indexOf("{");
  if (start < 0) return null;
  var braceCount = 0;
  var end = -1;
  for (var i = start; i < s.length; i++) {
    if (s[i] === "{") braceCount++;
    else if (s[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        end = i;
        break;
      }
    }
  }
  if (end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch (e) {}
  }
  var lastEnd = s.lastIndexOf("}");
  if (lastEnd > start) {
    try {
      return JSON.parse(s.slice(start, lastEnd + 1));
    } catch (e) {}
  }
  return null;
}

function makeEmptyGuideAggregate(state) {
  return {
    version: 1,
    sessionId: state && state.sessionId ? state.sessionId : "sess_" + Date.now().toString(36),
    tabId: state && Number.isFinite(state.tabId) ? state.tabId : null,
    startedAt: Date.now(),
    sourceUrl: (state && state.sourceUrl) || "",
    sourceTitle: (state && state.sourceTitle) || "",
    visitedUrls: (state && state.sourceUrl ? [state.sourceUrl] : []),
    events: [],
    guideSteps: [],
    timelineOffsetMs: 0,
    lastEventT: 0,
    lastRawT: -1,
  };
}

function normalizeEventsIntoAggregate(aggregate, events) {
  if (!aggregate || !Array.isArray(events) || !events.length) return aggregate || null;
  const out = aggregate;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev || typeof ev !== "object") continue;
    const rawT = Number.isFinite(ev.t) ? ev.t : out.lastRawT + 1;
    // New document/session chunk resets local clock; keep global timeline monotonic.
    if (out.lastRawT >= 0 && rawT + 120 < out.lastRawT) {
      out.timelineOffsetMs = out.lastEventT + 280;
    }
    const normalizedT = Math.max(out.lastEventT, Math.round(rawT + out.timelineOffsetMs));
    const evNorm = Object.assign({}, ev, { t: normalizedT });
    out.events.push(evNorm);
    out.lastRawT = rawT;
    out.lastEventT = normalizedT;
    if (evNorm.type === "meta") {
      out.sourceUrl = evNorm.url || out.sourceUrl;
      out.sourceTitle = evNorm.title || out.sourceTitle;
      const url = evNorm.url || "";
      if (url && out.visitedUrls.indexOf(url) < 0) {
        out.visitedUrls.push(url);
      }
    }
  }
  return out;
}

function summarizeGuideActions(payload) {
  const guideSteps = Array.isArray(payload && payload.guideSteps) ? payload.guideSteps : [];
  if (!guideSteps.length) return "No guide steps were captured.";
  const lines = [];
  for (let i = 0; i < guideSteps.length; i++) {
    const s = guideSteps[i];
    const label = humanStepHint(s) || "highlighted area";
    const scrollY =
      s && s.scroll && typeof s.scroll.ratioY === "number" ? Math.round(s.scroll.ratioY * 100) + "%" : "n/a";
    const verb = s && s.actionKind === "highlight" ? "highlighted" : s && s.actionKind === "input" ? "typed in" : "clicked";
    lines.push((i + 1).toString() + ". " + verb + " " + label + " (scrollY " + scrollY + ")");
    if (lines.length >= 30) break;
  }
  return lines.join("\n");
}

function summarizePageContent(payload) {
  const events = Array.isArray(payload && payload.events) ? payload.events : [];
  const snippets = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev || ev.type !== "meta") continue;
    const txt = typeof ev.pageTextSnippet === "string" ? ev.pageTextSnippet.trim() : "";
    if (!txt || txt.length < 30) continue;
    const clipped = txt.slice(0, 420);
    if (snippets.indexOf(clipped) >= 0) continue;
    snippets.push(clipped);
    if (snippets.length >= 3) break;
  }
  if (!snippets.length) return "No page text snippets were captured.";
  return snippets
    .map(function (s, i) {
      return "Snippet " + (i + 1) + ": " + s;
    })
    .join("\n\n");
}

/** Same logic as content script — safety net if an old client sends full events. */
function slimEventsForCompile(events) {
  if (!Array.isArray(events)) return [];
  const allow = {
    meta: true,
    point: true,
    input: true,
    scroll: true,
    highlight: true,
    engagement_gate: true,
    focus_lock: true,
  };
  const out = [];
  let lastScrollSig = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e || typeof e.type !== "string" || !allow[e.type]) continue;
    if (e.type === "scroll") {
      const sig = (e.targetSelector || "") + ":" + (e.ratioX || 0) + ":" + (e.ratioY || 0);
      if (sig === lastScrollSig) continue;
      lastScrollSig = sig;
    }
    out.push(e);
  }
  const HARD_CAP = 2000;
  if (out.length <= HARD_CAP) return out;
  const meta0 = out.filter(function (x) {
    return x.type === "meta";
  })[0];
  const rest = out.filter(function (x) {
    return x.type !== "meta";
  });
  const budget = HARD_CAP - 1;
  const tail = budget > 0 ? rest.slice(-budget) : [];
  return meta0 ? [meta0].concat(tail) : rest.slice(-HARD_CAP);
}

const GENERIC_HTML_LABELS_BG = {
  p: true,
  div: true,
  span: true,
  section: true,
  article: true,
  main: true,
  body: true,
  html: true,
  header: true,
  footer: true,
  nav: true,
  aside: true,
  li: true,
  td: true,
  th: true,
  tr: true,
};

function looksLikeCssSelector(s) {
  if (!s || typeof s !== "string") return false;
  return /[.#>\[\]:~+]/.test(s) || /^[a-z]+[-_][a-z]/i.test(s) || s.split("-").length > 3 || s.split("_").length > 3;
}

function cleanLabel(raw) {
  if (!raw || typeof raw !== "string") return "";
  var s = raw.trim();
  if (looksLikeCssSelector(s)) {
    s = s.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    if (s.split(" ").length > 6) return "";
  }
  return s.slice(0, 90);
}

function humanStepHint(gs) {
  if (!gs) return "";
  if (gs.actionKind === "highlight") {
    const ht = gs.highlightText ? String(gs.highlightText).trim() : "";
    if (ht.length > 12) return "highlight: \u201C" + ht.slice(0, 72) + (ht.length > 72 ? "\u2026" : "") + "\u201D";
    return "highlight text on the page";
  }
  if (gs.actionKind === "input") {
    const fld = cleanLabel(gs.fieldLabel) || cleanLabel(gs.elementLabel) || "input field";
    const val = gs.inputValueSnippet ? String(gs.inputValueSnippet).trim() : "";
    return val ? 'type "' + val.slice(0, 42) + '" into ' + fld : "type into " + fld;
  }
  const summary = gs.stepSummary && String(gs.stepSummary).trim();
  if (summary && summary.length > 3 && !looksLikeCssSelector(summary)) return summary.slice(0, 120);
  const text = gs.elementText && String(gs.elementText).trim();
  if (text && text.length > 16) return text.slice(0, 100);
  const lab = cleanLabel(gs.elementLabel);
  if (lab && lab.length > 1 && !GENERIC_HTML_LABELS_BG[lab.toLowerCase()]) return lab.slice(0, 90);
  const role = gs.elementRole && String(gs.elementRole).trim();
  if (role && !GENERIC_HTML_LABELS_BG[role.toLowerCase()] && role.toLowerCase() !== "banner") {
    return role.slice(0, 80);
  }
  if (text && text.length > 1) return text.slice(0, 80);
  return "this area on the page";
}

function looksLikeHtmlTagNoise(s) {
  return /\b(?:highlight|look\s+for|find|tap|click)\s+(?:the\s+)?(?:a\s+)?(p|div|span|section|article|li|td|tr|body|html)\b/i.test(
    s || "",
  );
}

function sanitizeCompiledStudentText(text, gs) {
  const t0 = String(text || "").trim();
  if (!looksLikeHtmlTagNoise(t0) && !/\bthe\s+p\b/i.test(t0) && !/\bhighlight\s+p\b/i.test(t0)) {
    return t0;
  }
  const hint = humanStepHint(gs);
  if (!hint) {
    return t0.replace(
      /\b(highlight|look\s+for|find)\s+(the\s+)?(p|div|span|section)\b/gi,
      "Look at the highlighted area on the page",
    );
  }
  return (
    "Take a moment with " +
    hint +
    ". When you’re ready, click the glowing highlight to continue."
  );
}

function sanitizeCompiledTitle(title, gs, index) {
  const t0 = String(title || "").trim();
  const bad =
    looksLikeHtmlTagNoise(t0) ||
    /^highlight\b/i.test(t0) ||
    /\b(p|div|span)\s*$/i.test(t0) ||
    /^the\s+p\b/i.test(t0);
  if (!bad) return t0 || "Step " + (index + 1);
  const hint = humanStepHint(gs);
  if (hint) {
    const short = hint.length > 44 ? hint.slice(0, 41) + "…" : hint;
    return "Step " + (index + 1) + ": " + short;
  }
  return "Step " + (index + 1);
}

function buildCleanStepDigest(payload) {
  const guideSteps = Array.isArray(payload && payload.guideSteps) ? payload.guideSteps : [];
  if (!guideSteps.length) return "No steps recorded.";
  const lines = [];
  for (let i = 0; i < guideSteps.length; i++) {
    const s = guideSteps[i];
    if (!s) continue;
    const hint = humanStepHint(s);
    const page = s.pageUrl || payload.sourceUrl || "";
    const host = page ? page.replace(/^https?:\/\//, "").split("/")[0] : "";
    let line = "Step " + (i + 1) + ": ";
    if (s.actionKind === "highlight") {
      line += "Highlighted text — " + hint;
    } else if (s.actionKind === "input") {
      line += hint || "Typed into a field";
    } else {
      line += "Clicked " + (hint || "an element");
    }
    if (host) line += " (on " + host + ")";
    lines.push(line);
    if (lines.length >= 24) break;
  }
  return lines.join("\n");
}

function fallbackGuideFromPayload(payload) {
  const sourceTitle = payload.sourceTitle || "Interactive Guide";
  const sourceUrl = payload.sourceUrl || "";
  const steps = [];
  const guideSteps = Array.isArray(payload.guideSteps) ? payload.guideSteps : [];

  for (let i = 0; i < guideSteps.length; i++) {
    const gs = guideSteps[i];
    if (!gs) continue;
    const hint = humanStepHint(gs);
    const label = hint || "this area on the page";
    const titleShort = label.length > 40 ? label.slice(0, 37) + "…" : label;
    steps.push({
      title: "Step " + (steps.length + 1) + ": " + titleShort,
      studentText:
        "Spend a moment with " +
        label +
        ", then click the highlight to move forward.",
      teacherTip: hint
        ? "Auto fallback — about: " + hint.slice(0, 100)
        : "Captured from your click sequence.",
      targetSelector: gs.targetSelector || "",
      scroll: gs.scroll || { targetSelector: null, ratioX: 0, ratioY: 0 },
      pageUrl: gs.pageUrl || sourceUrl || "",
      thumbnailDataUrl: gs.thumbnailDataUrl || "",
      clickX: Number.isFinite(gs.clientX) ? gs.clientX : 0,
      clickY: Number.isFinite(gs.clientY) ? gs.clientY : 0,
      docX: Number.isFinite(gs.docX) ? gs.docX : 0,
      docY: Number.isFinite(gs.docY) ? gs.docY : 0,
      elRect: gs.elRect || null,
      highlightRange: gs.highlightRange || null,
      highlightRect: gs.highlightRect || null,
      highlightText: gs.highlightText || "",
      actionKind: gs.actionKind || "",
      zoomScale: Number.isFinite(gs.zoomScale)
        ? gs.zoomScale
        : gs.elementRole === "button" || gs.elementRole === "a" || gs.elementRole === "input"
          ? 1.16
          : 1.08,
    });
  }

  if (!steps.length) {
    const evs = slimEventsForCompile(payload.events || []);
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (!ev || (ev.type !== "point" && ev.type !== "scroll" && ev.type !== "input")) continue;
      if (ev.type === "point") {
        steps.push({
          title: "Step " + (steps.length + 1),
          studentText: "Click the highlighted point to continue.",
          teacherTip: "Auto-generated fallback step.",
          targetSelector: ev.targetSelector || "",
          scroll: { targetSelector: null, ratioX: 0, ratioY: 0 },
          pageUrl: sourceUrl || "",
          thumbnailDataUrl: "",
          clickX: Number.isFinite(ev.clientX) ? ev.clientX : 0,
          clickY: Number.isFinite(ev.clientY) ? ev.clientY : 0,
          zoomScale: 1.12,
        });
      } else if (ev.type === "input") {
        const fld = ev.fieldLabel || "input field";
        const val = ev.valueSnippet ? String(ev.valueSnippet).trim() : "";
        steps.push({
          title: "Step " + (steps.length + 1),
          studentText: val
            ? 'Type "' + val.slice(0, 42) + '" in ' + fld + ", then continue."
            : "Type in " + fld + ", then continue.",
          teacherTip: "Auto-generated from typed input activity.",
          targetSelector: ev.targetSelector || "",
          scroll: { targetSelector: null, ratioX: 0, ratioY: 0 },
          pageUrl: sourceUrl || "",
          thumbnailDataUrl: "",
          clickX: 0,
          clickY: 0,
          zoomScale: 1.12,
        });
      } else if (ev.type === "scroll") {
        steps.push({
          title: "Step " + (steps.length + 1),
          studentText: "Scroll to the highlighted area before moving on.",
          teacherTip: "Auto-generated fallback step.",
          targetSelector: "",
          scroll: {
            targetSelector: ev.targetSelector || null,
            ratioX: ev.ratioX || 0,
            ratioY: ev.ratioY || 0,
          },
          pageUrl: sourceUrl || "",
          thumbnailDataUrl: "",
        });
      }
      if (steps.length >= 24) break;
    }
  }

  if (!steps.length) {
    steps.push({
      title: "Step 1",
      studentText: "Begin reading the page, then follow your teacher's prompts.",
      teacherTip: "Fallback guide created without AI output.",
      targetSelector: "",
      scroll: { targetSelector: null, ratioX: 0, ratioY: 0 },
      thumbnailDataUrl: "",
    });
  }

  return {
    version: 2,
    title: sourceTitle,
    sourceUrl: sourceUrl,
    sourceTitle: sourceTitle,
    routeUrls: Array.isArray(payload.routeUrls) ? payload.routeUrls.slice(0, 30) : [],
    steps: steps,
  };
}

function stripSelectorNoise(text) {
  if (!text || typeof text !== "string") return text || "";
  return text
    .replace(/[a-z]+(?:[-_][a-z0-9]+){3,}/gi, function (m) {
      return m.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    })
    .replace(/\b(div|span|section|article|li|td|tr|th|nav|aside|main|body|html|header|footer)\b/gi, "")
    .replace(/[.#>\[\]:~+]{2,}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeTeacherTip(tip, gs) {
  var t = String(tip || "").trim();
  if (!t || t.length < 3) {
    var hint = humanStepHint(gs);
    return hint ? "Focus on: " + hint.slice(0, 100) : "";
  }
  t = stripSelectorNoise(t);
  if (t.length < 4) {
    var hint2 = humanStepHint(gs);
    return hint2 ? "Focus on: " + hint2.slice(0, 100) : "";
  }
  return t.slice(0, 160);
}

async function compileInteractiveGuide(payload) {
  const guideModel = await getGuideCompileModel();
  const stepDigest = buildCleanStepDigest(payload);
  const pageContext = summarizePageContent(payload);
  const stepCount = Array.isArray(payload.guideSteps) ? payload.guideSteps.length : 0;

  const systemMsg =
    "You write student guides. Given a list of teacher actions on a webpage, produce a JSON object.\n" +
    "Format: {\"title\":\"short guide title\",\"steps\":[{\"title\":\"short step title\",\"studentText\":\"1-2 friendly sentences telling the student what to do\",\"teacherTip\":\"brief note for the teacher\"}]}\n" +
    "Rules:\n" +
    "- Output ONLY raw JSON, no markdown, no code fences, no extra text\n" +
    "- The number of steps MUST match exactly: " + stepCount + " steps\n" +
    "- Use plain English. Never mention HTML tags, CSS selectors, or code\n" +
    "- Base your text ONLY on the actions listed. Do not invent facts\n" +
    "- studentText should tell the student what to look at or do, in a friendly tone\n" +
    "- title should be short (3-6 words) and describe what the guide covers";

  const userMsg =
    "Page: " + (payload.sourceTitle || "Untitled") + " (" + (payload.sourceUrl || "") + ")\n\n" +
    "Teacher actions:\n" + stepDigest +
    (pageContext && pageContext.indexOf("No page text") < 0 ? "\n\nPage context:\n" + pageContext : "");

  const ai = await featherlessChat({
    model: guideModel,
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ],
    temperature: 0.15,
    max_tokens: 1800,
    top_p: 0.85,
    top_k: 20,
  });

  let parsed = null;
  let warning = "";

  if (ai.ok) {
    const maybe = extractJsonObject(ai.content);
    if (maybe && Array.isArray(maybe.steps)) {
      parsed = maybe;
    } else {
      warning = "AI output was not valid JSON. Used fallback guide.";
    }
  } else {
    warning = ai.error || "AI compile failed. Used fallback guide.";
  }

  if (!parsed) {
    parsed = fallbackGuideFromPayload(payload);
  }

  const thumbs = (payload.guideSteps || []).map(function (s) {
    return s.thumbnailDataUrl || "";
  });
  parsed.version = 2;
  parsed.sourceUrl = payload.sourceUrl || "";
  parsed.sourceTitle = payload.sourceTitle || "";
  const gSteps = payload.guideSteps || [];
  parsed.steps = (parsed.steps || []).map(function (step, i) {
    const gs = gSteps[i];
    const merged = Object.assign({}, step, {
      thumbnailDataUrl: thumbs[i] || step.thumbnailDataUrl || "",
      targetSelector: gs && gs.targetSelector ? gs.targetSelector : step.targetSelector || "",
      pageUrl: gs && gs.pageUrl ? gs.pageUrl : step.pageUrl || payload.sourceUrl || "",
      actionKind: gs && gs.actionKind ? gs.actionKind : step.actionKind || "",
      inputValueSnippet: gs && gs.inputValueSnippet ? gs.inputValueSnippet : step.inputValueSnippet || "",
      fieldLabel: gs && gs.fieldLabel ? gs.fieldLabel : step.fieldLabel || "",
      highlightRange: gs && gs.highlightRange ? gs.highlightRange : step.highlightRange || null,
      highlightRect: gs && gs.highlightRect ? gs.highlightRect : step.highlightRect || null,
      highlightText: gs && gs.highlightText ? gs.highlightText : step.highlightText || "",
      clickX: gs && Number.isFinite(gs.clientX) ? gs.clientX : step.clickX || 0,
      clickY: gs && Number.isFinite(gs.clientY) ? gs.clientY : step.clickY || 0,
      docX: gs && Number.isFinite(gs.docX) ? gs.docX : step.docX || 0,
      docY: gs && Number.isFinite(gs.docY) ? gs.docY : step.docY || 0,
      elRect: gs && gs.elRect ? gs.elRect : step.elRect || null,
      zoomScale:
        gs && Number.isFinite(gs.zoomScale)
          ? gs.zoomScale
          : gs && (gs.elementRole === "button" || gs.elementRole === "a" || gs.elementRole === "input")
            ? 1.16
            : Number.isFinite(step.zoomScale)
              ? step.zoomScale
              : 1.08,
    });
    merged.studentText = stripSelectorNoise(sanitizeCompiledStudentText(merged.studentText, gs));
    merged.title = stripSelectorNoise(sanitizeCompiledTitle(merged.title, gs, i));
    merged.teacherTip = sanitizeTeacherTip(merged.teacherTip, gs);
    return merged;
  });
  const derivedRoute = [];
  for (let i = 0; i < gSteps.length; i++) {
    const u = gSteps[i] && gSteps[i].pageUrl ? gSteps[i].pageUrl : "";
    if (u && derivedRoute.indexOf(u) < 0) derivedRoute.push(u);
  }
  parsed.routeUrls = Array.isArray(payload.routeUrls) && payload.routeUrls.length
    ? payload.routeUrls.slice(0, 30)
    : derivedRoute.slice(0, 30);
  parsed.title = stripSelectorNoise(parsed.title || payload.sourceTitle || "Guide");
  const id = "guide_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const store = {};
  store["interactiveGuide_" + id] = parsed;
  await chrome.storage.local.set(store);
  return { ok: true, guideId: id, guide: parsed, warning: warning || undefined };
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "GL_GUIDE_SESSION_START") {
    void (async function () {
      const sessionId = "sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
      const state = {
        active: true,
        tabId: Number.isFinite(message.tabId) ? message.tabId : sender.tab && sender.tab.id,
        sourceUrl: message.sourceUrl || "",
        sourceTitle: message.sourceTitle || "",
        sessionId: sessionId,
        startedAt: Date.now(),
      };
      const aggregate = makeEmptyGuideAggregate(state);
      await chrome.storage.local.set({
        [GUIDE_CAPTURE_STATE_KEY]: state,
        [GUIDE_CAPTURE_AGG_KEY]: aggregate,
      });
      sendResponse({ ok: true, state: state });
    })();
    return true;
  }

  if (message.type === "GL_GUIDE_SESSION_STATUS") {
    void chrome.storage.local
      .get([GUIDE_CAPTURE_STATE_KEY, GUIDE_CAPTURE_AGG_KEY])
      .then(function (d) {
        const state = d[GUIDE_CAPTURE_STATE_KEY] || { active: false };
        const agg = d[GUIDE_CAPTURE_AGG_KEY] || null;
        sendResponse({
          ok: true,
          active: !!state.active,
          tabId: state.tabId,
          sourceUrl: state.sourceUrl || "",
          sourceTitle: state.sourceTitle || "",
          events: agg && Array.isArray(agg.events) ? agg.events.length : 0,
          steps: agg && Array.isArray(agg.guideSteps) ? agg.guideSteps.length : 0,
        });
      })
      .catch(function (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      });
    return true;
  }

  if (message.type === "GL_GUIDE_SESSION_GET") {
    void chrome.storage.local
      .get(GUIDE_CAPTURE_STATE_KEY)
      .then(function (d) {
        const state = d[GUIDE_CAPTURE_STATE_KEY] || { active: false };
        const senderTabId = sender.tab && sender.tab.id;
        const sameTab = Number.isFinite(senderTabId) && senderTabId === state.tabId;
        sendResponse({ ok: true, active: !!state.active && sameTab });
      })
      .catch(function () {
        sendResponse({ ok: true, active: false });
      });
    return true;
  }

  if (message.type === "GL_GUIDE_SESSION_FINALIZE") {
    void (async function () {
      const d = await chrome.storage.local.get([GUIDE_CAPTURE_STATE_KEY, GUIDE_CAPTURE_AGG_KEY]);
      const state = d[GUIDE_CAPTURE_STATE_KEY] || { active: false };
      const agg = d[GUIDE_CAPTURE_AGG_KEY] || null;
      await chrome.storage.local.remove([GUIDE_CAPTURE_STATE_KEY, GUIDE_CAPTURE_AGG_KEY]);
      if (!state.active || !agg) {
        sendResponse({ ok: false, error: "No active guide session" });
        return;
      }
      sendResponse({
        ok: true,
        payload: {
          sourceUrl:
            (Array.isArray(agg.visitedUrls) && agg.visitedUrls[0]) || agg.sourceUrl || state.sourceUrl || "",
          sourceTitle: agg.sourceTitle || state.sourceTitle || "",
          routeUrls: Array.isArray(agg.visitedUrls) ? agg.visitedUrls.slice(0, 30) : [],
          events: slimEventsForCompile(agg.events || []),
          guideSteps: Array.isArray(agg.guideSteps) ? agg.guideSteps : [],
        },
      });
    })();
    return true;
  }

  if (message.type === "GL_COMPILE_INTERACTIVE_GUIDE") {
    void (async function () {
      let payload = message.payload;
      if (message.fromScratchKey) {
        const data = await chrome.storage.local.get("classLoopPendingCompilePayload");
        payload = data.classLoopPendingCompilePayload;
        await chrome.storage.local.remove("classLoopPendingCompilePayload");
      }
      if (!payload || typeof payload !== "object") {
        sendResponse({ ok: false, error: "Missing compile payload" });
        return;
      }
      try {
        const result = await compileInteractiveGuide(payload);
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (message.type === "GL_FEATHERLESS_CHAT") {
    void featherlessChat({
      messages: message.messages || [],
      temperature: message.temperature,
      max_tokens: message.max_tokens,
      top_p: message.top_p,
      top_k: message.top_k,
      timeoutMs: message.timeoutMs,
    })
      .then(sendResponse)
      .catch(function (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      });
    return true;
  }

  if (message.type === "GL_SHORTEN_URL") {
    void (async function () {
      const longUrl = typeof message.url === "string" ? message.url.trim() : "";
      if (!longUrl) {
        sendResponse({ ok: false, error: "Missing URL" });
        return;
      }
      try {
        const target = "https://is.gd/create.php?format=simple&url=" + encodeURIComponent(longUrl);
        const res = await fetch(target, { method: "GET", cache: "no-store" });
        const txt = (await res.text()).trim();
        if (!res.ok || !/^https?:\/\//i.test(txt)) {
          sendResponse({ ok: false, error: txt || "Shortener failed" });
          return;
        }
        sendResponse({ ok: true, shortUrl: txt });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (message.type === "GL_GET_SAVED_GUIDE") {
    void chrome.storage.local
      .get("interactiveGuide_" + message.guideId)
      .then(function (data) {
        const g = data["interactiveGuide_" + message.guideId];
        sendResponse({ ok: !!g, guide: g || null });
      })
      .catch(function () {
        sendResponse({ ok: false, guide: null });
      });
    return true;
  }

  if (message.type === "GUIDED_LESSON_FOCUS_LOST") {
    const tabId = sender.tab && sender.tab.id;
    void chrome.storage.local.set({ guidedLessonLastFocusLostAt: Date.now() });
    void postToBackend("/api/extension/focus-lost", {
      ...message,
      tabId,
      lessonTabId: tabId,
    });
    return;
  }

  if (message.type === "GUIDED_LESSON_FOCUS_RESTORED") {
    void chrome.storage.local.set({ guidedLessonLastFocusRestoredAt: Date.now() });
    void postToBackend("/api/extension/focus-restored", {
      ...message,
      tabId: sender.tab && sender.tab.id,
    });
    return;
  }

  if (message.type === "GUIDED_LESSON_RECORDING_CHUNK" && Array.isArray(message.events)) {
    const n = message.events.length;
    void (async function () {
      try {
        const data = await chrome.storage.local.get(["guidedLessonTotalChunks", "guidedLessonTotalEvents", GUIDE_CAPTURE_STATE_KEY, GUIDE_CAPTURE_AGG_KEY]);
        const state = data[GUIDE_CAPTURE_STATE_KEY];
        const senderTabId = sender.tab && sender.tab.id;
        if (state && state.active && Number.isFinite(senderTabId) && senderTabId === state.tabId) {
          const aggregate = data[GUIDE_CAPTURE_AGG_KEY] || makeEmptyGuideAggregate(state);
          normalizeEventsIntoAggregate(aggregate, message.events);
          await chrome.storage.local.set({ [GUIDE_CAPTURE_AGG_KEY]: aggregate });
        }
        await chrome.storage.local.set({
          guidedLessonLastChunkAt: Date.now(),
          guidedLessonLastChunkEventCount: n,
          guidedLessonTotalChunks: (data.guidedLessonTotalChunks || 0) + 1,
          guidedLessonTotalEvents: (data.guidedLessonTotalEvents || 0) + n,
        });
      } catch {}
    })();
    void postToBackend("/api/extension/recording-chunk", {
      events: message.events,
      tabId: sender.tab && sender.tab.id,
      url: sender.tab && sender.tab.url,
    });
    return;
  }

  if (message.type === "GUIDED_LESSON_GUIDE_STEP" && message.step && typeof message.step === "object") {
    void (async function () {
      try {
        const data = await chrome.storage.local.get([GUIDE_CAPTURE_STATE_KEY, GUIDE_CAPTURE_AGG_KEY]);
        const state = data[GUIDE_CAPTURE_STATE_KEY];
        const senderTabId = sender.tab && sender.tab.id;
        if (!state || !state.active || !Number.isFinite(senderTabId) || senderTabId !== state.tabId) {
          sendResponse({ ok: false });
          return;
        }
        const aggregate = data[GUIDE_CAPTURE_AGG_KEY] || makeEmptyGuideAggregate(state);
        const step = Object.assign({}, message.step);
        if (Number.isFinite(step.t)) {
          step.t = Math.max(aggregate.lastEventT, Math.round(step.t + aggregate.timelineOffsetMs));
        } else {
          step.t = aggregate.lastEventT;
        }
        aggregate.guideSteps.push(step);
        aggregate.sourceUrl = sender.tab && sender.tab.url ? sender.tab.url : aggregate.sourceUrl;
        aggregate.sourceTitle = sender.tab && sender.tab.title ? sender.tab.title : aggregate.sourceTitle;
        const pageUrl = step.pageUrl || (sender.tab && sender.tab.url) || "";
        if (pageUrl && aggregate.visitedUrls.indexOf(pageUrl) < 0) {
          aggregate.visitedUrls.push(pageUrl);
        }
        await chrome.storage.local.set({ [GUIDE_CAPTURE_AGG_KEY]: aggregate });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.storage.local.set({
      [STORAGE_KEYS.apiBaseUrl]: "http://localhost:3000",
      [FEATHERLESS.model]: FEATHERLESS_DEFAULT_MODEL,
      [FEATHERLESS.guideModel]: FEATHERLESS_DEFAULT_GUIDE_MODEL,
      [FEATHERLESS.aiDefaultOn]: true,
    });
  }
});

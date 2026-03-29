/* Guided Lesson — content script (plain JS, no build step) */

const GL_START_RECORD = "GL_START_RECORD";
const GL_STOP_RECORD = "GL_STOP_RECORD";
const GL_START_PLAYBACK = "GL_START_PLAYBACK";
const GL_STOP_PLAYBACK = "GL_STOP_PLAYBACK";
const GL_GET_STATS = "GL_GET_STATS";
const GL_PING = "GL_PING";
const GL_START_INTERACTIVE_GUIDE = "GL_START_INTERACTIVE_GUIDE";
const GL_STOP_INTERACTIVE_GUIDE = "GL_STOP_INTERACTIVE_GUIDE";
const GL_START_COMPILED_GUIDE_PLAYBACK = "GL_START_COMPILED_GUIDE_PLAYBACK";
const GL_STOP_COMPILED_GUIDE_PLAYBACK = "GL_STOP_COMPILED_GUIDE_PLAYBACK";
const GL_CAPTURE_SOURCE_SNAPSHOT = "GL_CAPTURE_SOURCE_SNAPSHOT";
const GL_GUIDE_SESSION_GET = "GL_GUIDE_SESSION_GET";

// --- Selectors ---

function elementToCssPath(el, root) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
  root = root || document;
  var docRoot = root instanceof Document ? root.documentElement : root;

  if (el.id && /^[A-Za-z][\w-:.]*$/.test(el.id)) {
    return "#" + CSS.escape(el.id);
  }

  var uniqueAttr = tryUniqueAttr(el);
  if (uniqueAttr) return uniqueAttr;

  var segments = [];
  var current = el;
  while (current && current !== docRoot) {
    var parent = current.parentElement;
    if (!parent) break;

    if (current.id && /^[A-Za-z][\w-:.]*$/.test(current.id)) {
      segments.unshift("#" + CSS.escape(current.id));
      break;
    }
    var ua = tryUniqueAttr(current);
    if (ua) { segments.unshift(ua); break; }

    var tag = current.tagName.toLowerCase();
    var sibs = Array.from(parent.children).filter(function (c) {
      return c instanceof Element && c.tagName === current.tagName;
    });
    if (sibs.length === 1) {
      segments.unshift(tag);
    } else {
      var idx = sibs.indexOf(current) + 1;
      segments.unshift(tag + ":nth-of-type(" + idx + ")");
    }
    current = parent;
  }

  if (!segments.length) return null;
  return segments.join(" > ");
}

function tryUniqueAttr(el) {
  if (!(el instanceof Element)) return null;
  var tag = el.tagName.toLowerCase();
  var attrs = ["data-testid", "data-id", "name", "aria-label", "title", "href", "alt"];
  for (var i = 0; i < attrs.length; i++) {
    var v = el.getAttribute(attrs[i]);
    if (!v || v.length > 80) continue;
    var sel = tag + "[" + attrs[i] + "=" + JSON.stringify(v) + "]";
    try {
      if (document.querySelectorAll(sel).length === 1) return sel;
    } catch (_) { continue; }
  }
  return null;
}

function querySelectorStrict(selector, root) {
  root = root || document;
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

// --- Anchored text ranges (child path from common ancestor) ---

function pathBetween(origin, target) {
  if (origin === target) return [];

  const path = [];
  let node = target;

  while (node && node !== origin) {
    const parent = node.parentNode;
    if (!parent) return null;
    const idx = Array.prototype.indexOf.call(parent.childNodes, node);
    if (idx < 0) return null;
    path.unshift(idx);
    node = parent;
  }

  if (node !== origin) return null;
  return path;
}

function resolveNode(anchor, childIndices) {
  let n = anchor;
  for (let i = 0; i < childIndices.length; i++) {
    const next = n.childNodes[childIndices[i]];
    if (!next) return null;
    n = next;
  }
  return n;
}

function isTextOrElement(n) {
  return n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE;
}

function serializeAnchoredRange(range) {
  let ancestor = range.commonAncestorContainer;
  while (ancestor && ancestor.nodeType !== Node.ELEMENT_NODE) {
    ancestor = ancestor.parentNode;
  }
  if (!(ancestor instanceof Element)) return null;

  const anchorSelector = elementToCssPath(ancestor);
  if (!anchorSelector) return null;

  const startPath = pathBetween(ancestor, range.startContainer);
  const endPath = pathBetween(ancestor, range.endContainer);
  if (!startPath || !endPath) return null;

  return {
    start: { anchorSelector, childIndices: startPath, offset: range.startOffset },
    end: { anchorSelector, childIndices: endPath, offset: range.endOffset },
  };
}

function rangeFromAnchored(ar) {
  const anchor = querySelectorStrict(ar.start.anchorSelector);
  if (!anchor) return null;

  const startNode = resolveNode(anchor, ar.start.childIndices);
  const endNode = resolveNode(anchor, ar.end.childIndices);
  if (!startNode || !endNode) return null;
  if (!isTextOrElement(startNode) || !isTextOrElement(endNode)) return null;

  const r = document.createRange();
  try {
    r.setStart(startNode, ar.start.offset);
    r.setEnd(endNode, ar.end.offset);
  } catch {
    return null;
  }
  return r;
}

// --- Scroll (ratio-based) ---

function nearestScrollable(el) {
  let n = el;
  while (n && n !== document.documentElement) {
    const st = getComputedStyle(n);
    const oy = st.overflowY;
    const ox = st.overflowX;
    const canY =
      (oy === "auto" || oy === "scroll" || oy === "overlay") && n.scrollHeight > n.clientHeight;
    const canX =
      (ox === "auto" || ox === "scroll" || ox === "overlay") && n.scrollWidth > n.clientWidth;
    if (canY || canX) return n;
    n = n.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function captureScrollTarget(ev) {
  const target =
    ev.target instanceof Element
      ? nearestScrollable(ev.target)
      : document.scrollingElement || document.documentElement;
  const maxX = Math.max(0, target.scrollWidth - target.clientWidth);
  const maxY = Math.max(0, target.scrollHeight - target.clientHeight);
  const ratioX = maxX > 0 ? target.scrollLeft / maxX : 0;
  const ratioY = maxY > 0 ? target.scrollTop / maxY : 0;

  const isRoot =
    target === document.documentElement ||
    target === document.body ||
    target === document.scrollingElement;

  return {
    targetSelector: isRoot ? null : elementToCssPath(target),
    ratioX,
    ratioY,
  };
}

function applyScrollTarget(st) {
  const el = st.targetSelector
    ? document.querySelector(st.targetSelector)
    : document.scrollingElement || document.documentElement;
  if (!(el instanceof Element)) return;
  const maxX = Math.max(0, el.scrollWidth - el.clientWidth);
  const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
  el.scrollLeft = st.ratioX * maxX;
  el.scrollTop = st.ratioY * maxY;
}

function isGuidedLessonUiTarget(ev) {
  const t = ev && ev.target;
  return !!(t && t.closest && t.closest("[data-guided-lesson-ui]"));
}

function getPageTextSnippet() {
  try {
    const root =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector("[role='main']") ||
      document.body;
    const raw = (root && root.innerText) || "";
    return raw.replace(/\s+/g, " ").trim().slice(0, 1800);
  } catch {
    return "";
  }
}

function bestClickTarget(el) {
  if (!(el instanceof Element)) return el;
  var interactive = el.closest("a, button, input, textarea, select, summary, [role='button'], [role='tab'], [role='link'], [tabindex]");
  if (interactive) return interactive;
  var r = el.getBoundingClientRect();
  if (r.width < 6 || r.height < 6) {
    var parent = el.parentElement;
    if (parent && parent !== document.body && parent !== document.documentElement) {
      var pr = parent.getBoundingClientRect();
      if (pr.width > 0 && pr.height > 0 && pr.width < window.innerWidth * 0.5) return parent;
    }
  }
  return el;
}

function humanizeIdOrName(raw) {
  if (!raw || typeof raw !== "string") return "";
  var s = raw.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  if (s.length < 2 || s.split(" ").length > 8) return "";
  return s.slice(0, 60);
}

// --- Highlights ---

function applyWrappedHighlight(range, className) {
  className = className || "guided-lesson-highlight";
  const span = document.createElement("span");
  span.className = className;
  span.setAttribute("data-guided-lesson", "1");

  const clone = range.cloneRange();
  try {
    clone.surroundContents(span);
  } catch {
    try {
      const frag = clone.extractContents();
      span.appendChild(frag);
      clone.insertNode(span);
    } catch {
      return function () {};
    }
  }

  return function undo() {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  };
}

// --- Engagement gate (closed Shadow DOM) ---

class EngagementGate {
  constructor() {
    this.host = null;
  }

  show(payload) {
    this.dismiss();

    const host = document.createElement("div");
    host.setAttribute("data-guided-lesson-gate", payload.id);
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483646";
    host.style.pointerEvents = "auto";

    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .card {
        width: min(92vw, 420px);
        background: #0f172a;
        color: #f8fafc;
        border-radius: 12px;
        padding: 20px 22px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.45);
        border: 1px solid rgba(148, 163, 184, 0.35);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 1.1rem;
        font-weight: 650;
        line-height: 1.35;
      }
      p {
        margin: 0 0 16px;
        color: #cbd5e1;
        font-size: 0.95rem;
        line-height: 1.5;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 8px;
        padding: 10px 14px;
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        background: #38bdf8;
        color: #0b1220;
      }
      button:focus-visible {
        outline: 2px solid #e0f2fe;
        outline-offset: 2px;
      }
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "card";

    const h1 = document.createElement("h1");
    h1.textContent = payload.title;
    card.appendChild(h1);

    if (payload.body) {
      const p = document.createElement("p");
      p.textContent = payload.body;
      card.appendChild(p);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = payload.dismissLabel || "Continue";
    btn.addEventListener("click", () => {
      const cb = payload.onDismiss;
      this.dismiss();
      if (typeof cb === "function") cb();
    });

    card.appendChild(btn);
    backdrop.appendChild(card);
    shadow.append(style, backdrop);
    document.documentElement.appendChild(host);
    this.host = host;
    btn.focus();
  }

  dismiss() {
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    this.host = null;
  }
}

// --- Focus lock (Page Visibility + runtime messages) ---

class FocusLockController {
  constructor(opts) {
    this.opts = opts || {};
    this.bound = false;
    this.onVisibility = this.onVisibility.bind(this);
  }

  attach() {
    if (this.bound) return;
    this.bound = true;
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  detach() {
    if (!this.bound) return;
    this.bound = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  onVisibility() {
    if (document.hidden) {
      const msg = {
        type: "GUIDED_LESSON_FOCUS_LOST",
        url: location.href,
        hiddenAt: Date.now(),
      };
      if (this.opts.onLost) this.opts.onLost(msg);
      void chrome.runtime.sendMessage(msg).catch(() => {});
      return;
    }

    const msg = {
      type: "GUIDED_LESSON_FOCUS_RESTORED",
      resumedAt: Date.now(),
    };
    if (this.opts.onRestored) this.opts.onRestored(msg);
    void chrome.runtime.sendMessage(msg).catch(() => {});
  }
}

// --- Playback clock (nested freeze for tab + gate) ---

class PlaybackClock {
  constructor() {
    this.origin = performance.now();
    this.pausedAccum = 0;
    this.freezeStack = [];
  }

  reset() {
    this.origin = performance.now();
    this.pausedAccum = 0;
    this.freezeStack.length = 0;
  }

  freeze() {
    this.freezeStack.push(performance.now());
  }

  thaw() {
    const start = this.freezeStack.pop();
    if (start !== undefined) {
      this.pausedAccum += performance.now() - start;
    }
  }

  now() {
    const edge =
      this.freezeStack.length > 0
        ? this.freezeStack[this.freezeStack.length - 1]
        : performance.now();
    return edge - this.origin - this.pausedAccum;
  }
}

// --- Playback ---

class LessonPlayback {
  constructor(opts) {
    this.opts = opts || {};
    this.gate = new EngagementGate();
    this.clock = new PlaybackClock();
    this.focus = new FocusLockController({
      onLost: () => this.clock.freeze(),
      onRestored: () => this.clock.thaw(),
    });
    this.raf = null;
    this.idx = 0;
    this.recording = null;
    this.cleanups = [];
    this.tick = this.tick.bind(this);
  }

  start(recording) {
    this.stop();
    this.clock.reset();
    this.recording = recording;
    this.idx = 0;
    this.focus.attach();
    this.tick();
  }

  stop() {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.focus.detach();
    this.gate.dismiss();
    this.clock.reset();
    for (let i = 0; i < this.cleanups.length; i++) this.cleanups[i]();
    this.cleanups = [];
    this.recording = null;
    this.idx = 0;
  }

  tick() {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.recording) return;

    const t = this.clock.now();
    const evs = this.recording.events;

    while (this.idx < evs.length && evs[this.idx].t <= t) {
      const ev = evs[this.idx];
      this.applyEvent(ev);
      if (this.opts.onEventApplied) this.opts.onEventApplied(ev);
      this.idx += 1;
    }

    if (this.idx >= evs.length) {
      this.stop();
    }
  }

  isPlaying() {
    return this.recording !== null;
  }

  getPlaybackPosition() {
    if (!this.recording) {
      return { playbackActive: false, index: 0, total: 0 };
    }
    return {
      playbackActive: true,
      index: this.idx,
      total: this.recording.events.length,
    };
  }

  applyEvent(ev) {
    switch (ev.type) {
      case "meta":
      case "pointer":
      case "point":
      case "focus_lock":
        break;
      case "scroll":
        applyScrollTarget(ev);
        break;
      case "highlight": {
        const range = rangeFromAnchored(ev.range);
        if (!range) break;
        const undo = applyWrappedHighlight(range, ev.className);
        this.cleanups.push(undo);
        break;
      }
      case "engagement_gate":
        this.clock.freeze();
        this.gate.show({
          id: ev.id,
          title: ev.title,
          body: ev.body,
          dismissLabel: ev.dismissLabel,
          onDismiss: () => this.clock.thaw(),
        });
        break;
      default:
        break;
    }
  }
}

// --- Recorder ---

class LessonRecorder {
  constructor(opts) {
    this.opts = Object.assign(
      {
        pointerThrottleMs: 40,
        pointerMinDelta: 6,
        onEvent: function () {},
        shouldIgnoreInteraction: function () {
          return false;
        },
      },
      opts || {},
    );
    this.startedAt = 0;
    this.events = [];
    this.listenersBound = false;
    this.lastPointer = null;
    this.lastPointerEmit = 0;
    this.rafPointer = null;

    this.onScroll = this.onScroll.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onFieldChange = this.onFieldChange.bind(this);
  }

  start() {
    this.stop();
    this.startedAt = performance.now();
    this.events = [];
    this.events.push({
      t: 0,
      type: "meta",
      url: location.href,
      title: document.title,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      pageTextSnippet: getPageTextSnippet(),
    });
    this.bind();
    return this.snapshot();
  }

  stop() {
    this.unbind();
    return this.snapshot();
  }

  snapshot() {
    return { version: 1, events: this.events.slice() };
  }

  /** True while capture listeners are attached (between start and stop). */
  isRecording() {
    return this.listenersBound;
  }

  getEventCount() {
    return this.events.length;
  }

  nowT() {
    return Math.round(performance.now() - this.startedAt);
  }

  push(ev) {
    this.events.push(ev);
    this.opts.onEvent(ev);
  }

  bind() {
    if (this.listenersBound) return;
    this.listenersBound = true;
    document.addEventListener("scroll", this.onScroll, true);
    window.addEventListener("mousemove", this.onMouseMove, { passive: true });
    document.addEventListener("mouseup", this.onMouseUp, true);
    document.addEventListener("mousedown", this.onClick, true);
    document.addEventListener("change", this.onFieldChange, true);
  }

  unbind() {
    if (!this.listenersBound) return;
    this.listenersBound = false;
    document.removeEventListener("scroll", this.onScroll, true);
    window.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp, true);
    document.removeEventListener("mousedown", this.onClick, true);
    document.removeEventListener("change", this.onFieldChange, true);
    if (this.rafPointer !== null) {
      cancelAnimationFrame(this.rafPointer);
      this.rafPointer = null;
    }
  }

  onScroll(ev) {
    if (this.opts.shouldIgnoreInteraction(ev)) return;
    const st = captureScrollTarget(ev);
    this.push(Object.assign({ t: this.nowT(), type: "scroll" }, st));
  }

  schedulePointerFlush() {
    if (this.rafPointer !== null) return;
    this.rafPointer = requestAnimationFrame(() => {
      this.rafPointer = null;
      const now = performance.now();
      if (now - this.lastPointerEmit < this.opts.pointerThrottleMs) return;
      if (this.lastPointer) {
        this.emitPointer(this.lastPointer);
        this.lastPointerEmit = now;
      }
    });
  }

  shouldEmitPointer(next, prev) {
    if (!prev) return true;
    const dx = next.clientX - prev.clientX;
    const dy = next.clientY - prev.clientY;
    return Math.hypot(dx, dy) >= this.opts.pointerMinDelta;
  }

  pointerSample(ev) {
    const rel = this.relativeFromPoint(ev.clientX, ev.clientY);
    const sample = { clientX: ev.clientX, clientY: ev.clientY };
    if (rel) sample.relative = rel;
    return sample;
  }

  relativeFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!(el instanceof Element)) return null;
    const path = elementToCssPath(el);
    if (!path) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      elementSelector: path,
      nx: (clientX - r.left) / r.width,
      ny: (clientY - r.top) / r.height,
    };
  }

  emitPointer(sample) {
    this.push(
      Object.assign(
        {
          t: this.nowT(),
          type: "pointer",
        },
        sample,
      ),
    );
  }

  onMouseMove(ev) {
    if (this.opts.shouldIgnoreInteraction(ev)) return;
    const sample = this.pointerSample(ev);
    const prev = this.lastPointer;
    this.lastPointer = sample;
    const now = performance.now();
    if (now - this.lastPointerEmit < this.opts.pointerThrottleMs) {
      this.schedulePointerFlush();
      return;
    }
    if (this.shouldEmitPointer(sample, prev)) {
      this.emitPointer(sample);
      this.lastPointerEmit = now;
    }
  }

  onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const anchored = serializeAnchoredRange(range);
    if (!anchored) return;
    this.push({
      t: this.nowT(),
      type: "highlight",
      range: anchored,
      className: "guided-lesson-highlight",
    });
  }

  onClick(ev) {
    if (this.opts.shouldIgnoreInteraction(ev)) return;
    var target = ev.target instanceof Element ? ev.target : null;
    if (!target) return;
    var bestTarget = bestClickTarget(target);
    var selector = elementToCssPath(bestTarget);
    if (!selector) return;

    var rect = bestTarget.getBoundingClientRect();
    var info = getGuideElementInfo({ clientX: ev.clientX, clientY: ev.clientY }, bestTarget);

    this.push({
      t: this.nowT(),
      type: "point",
      targetSelector: selector,
      clientX: ev.clientX,
      clientY: ev.clientY,
      docX: Math.round(ev.clientX + window.scrollX),
      docY: Math.round(ev.clientY + window.scrollY),
      elRect: {
        left: Math.round(rect.left + window.scrollX),
        top: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      elementLabel: info.elementLabel,
      elementText: info.elementText,
      elementRole: info.elementRole,
      stepSummary: info.stepSummary
    });
  }

  onFieldChange(ev) {
    if (this.opts.shouldIgnoreInteraction(ev)) return;
    const target = ev.target instanceof Element ? ev.target : null;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLSelectElement)) {
      return;
    }
    const selector = elementToCssPath(target);
    if (!selector) return;
    const valueRaw = "value" in target ? String(target.value || "") : "";
    const valueSnippet = valueRaw.trim().replace(/\s+/g, " ").slice(0, 64);
    var assocLabel = "";
    if (target.id) {
      var labelEl = document.querySelector('label[for="' + CSS.escape(target.id) + '"]');
      if (labelEl) assocLabel = (labelEl.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    }
    if (!assocLabel && target.closest("label")) {
      assocLabel = (target.closest("label").textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    }
    const fieldLabel =
      target.getAttribute("aria-label") ||
      assocLabel ||
      target.getAttribute("placeholder") ||
      humanizeIdOrName(target.getAttribute("name") || "") ||
      humanizeIdOrName(target.id || "") ||
      "input field";
    const fieldType =
      target instanceof HTMLInputElement
        ? target.type || "text"
        : target instanceof HTMLSelectElement
          ? "select"
          : "textarea";

    var rect = target.getBoundingClientRect();
    var info = getGuideElementInfo({}, target);

    this.push({
      t: this.nowT(),
      type: "input",
      targetSelector: selector,
      fieldType: fieldType,
      fieldLabel: String(fieldLabel || "input field").slice(0, 60),
      valueSnippet: valueSnippet,
      docX: Math.round(rect.left + rect.width / 2 + window.scrollX),
      docY: Math.round(rect.top + rect.height / 2 + window.scrollY),
      elRect: {
        left: Math.round(rect.left + window.scrollX),
        top: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      elementLabel: info.elementLabel,
      elementText: info.elementText,
      elementRole: info.elementRole,
      stepSummary: info.stepSummary
    });
  }
}

// --- Interactive guide studio (countdown + capture) ---

function showGuideStudioCountdown(onDone) {
  const host = document.createElement("div");
  host.setAttribute("data-guided-lesson-ui", "1");
  host.style.cssText =
    "all:initial;position:fixed;inset:0;z-index:2147483645;pointer-events:auto;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(9, 9, 11, 0.45);
      backdrop-filter: blur(4px);
      display: grid;
      place-items: center;
      font-family: Inter, system-ui, -apple-system, sans-serif;
    }
    .card {
      width: min(90vw, 400px);
      background: #fff;
      color: #18181b;
      border-radius: 14px;
      padding: 28px 26px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.12);
      border: 1px solid #e4e4e7;
      text-align: center;
    }
    .badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #e67e22;
      margin-bottom: 10px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.15rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0 0 18px;
      color: #71717a;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .count {
      font-size: 3.2rem;
      font-weight: 700;
      color: #18181b;
      letter-spacing: -0.04em;
      line-height: 1;
      margin-bottom: 4px;
    }
    .hint {
      font-size: 12px;
      color: #a1a1aa;
    }
  `;
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  const card = document.createElement("div");
  card.className = "card";
  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = "Interactive guide";
  const h1 = document.createElement("h1");
  h1.textContent = "Get ready";
  const p = document.createElement("p");
  p.textContent =
    "After the countdown, click and scroll on the page. Each click becomes a step. Alt+Shift+M marks a step on the last click.";
  const countEl = document.createElement("div");
  countEl.className = "count";
  countEl.textContent = "3";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Screen dims so students get a polished walkthrough later.";
  card.append(badge, h1, p, countEl, hint);
  backdrop.appendChild(card);
  shadow.append(style, backdrop);
  document.documentElement.appendChild(host);

  const seq = ["3", "2", "1", "Go"];
  let i = 0;
  function tick() {
    if (i >= seq.length) {
      host.remove();
      onDone();
      return;
    }
    countEl.textContent = seq[i];
    i += 1;
    const delay = i > seq.length - 1 ? 420 : 1000;
    setTimeout(tick, delay);
  }
  setTimeout(tick, 800);
}

let guideHudHost = null;

function removeGuideHud() {
  if (guideHudHost && guideHudHost.parentNode) {
    guideHudHost.parentNode.removeChild(guideHudHost);
  }
  guideHudHost = null;
}

function showGuideRecordingHud() {
  const host = document.createElement("div");
  host.setAttribute("data-guided-lesson-ui", "1");
  host.style.cssText =
    "all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483643;pointer-events:none;font-family:Inter,system-ui,sans-serif;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .pill {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 10px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.08);
      font-size: 12px;
      color: #3f3f46;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e67e22;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.9); }
    }
    strong { color: #18181b; font-weight: 600; }
  `;
  const pill = document.createElement("div");
  pill.className = "pill";
  const dot = document.createElement("span");
  dot.className = "dot";
  const text = document.createElement("span");
  text.innerHTML = "<strong>Recording guide</strong> — use the popup when done";
  pill.append(dot, text);
  shadow.append(style, pill);
  document.documentElement.appendChild(host);
  return host;
}

/** Drop pointer-move spam (thousands of events) so compile IPC + Featherless body stay small — fixes SW "Failed to fetch". */
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

const GENERIC_HTML_LABELS = new Set([
  "p",
  "div",
  "span",
  "section",
  "article",
  "main",
  "body",
  "html",
  "header",
  "footer",
  "nav",
  "aside",
  "li",
  "td",
  "th",
  "tr",
  "tbody",
  "thead",
]);

function findNearestHeadingText(el) {
  if (!(el instanceof Element)) return "";
  let node = el;
  for (let depth = 0; depth < 14 && node; depth++) {
    let sib = node.previousElementSibling;
    while (sib) {
      const tn = sib.tagName;
      if (tn && /^H[1-6]$/i.test(tn)) {
        return (sib.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
      }
      const h = sib.querySelector("h1, h2, h3");
      if (h) {
        return (h.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return "";
}

function buildStepSummary(el, elementText) {
  if (!(el instanceof Element)) return "";
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  const heading = findNearestHeadingText(el);
  const aria = (el.getAttribute("aria-label") || "").trim();
  if (aria.length > 2) return aria.slice(0, 100);

  if (tag === "a") {
    const t = (el.textContent || "").trim().replace(/\s+/g, " ");
    const href = (el.getAttribute("href") || "").trim();
    if (t.length > 1) return "the link “" + t.slice(0, 80) + "”";
    if (href) return "a link (" + href.slice(0, 55) + (href.length > 55 ? "…" : "") + ")";
    return "a link on the page";
  }
  if (tag === "button" || tag === "summary") {
    const t = (el.textContent || "").trim().replace(/\s+/g, " ");
    if (t.length > 1) return "the “" + t.slice(0, 80) + "” control";
    return "a button on the page";
  }
  if (tag === "img") {
    const alt = (el.getAttribute("alt") || "").trim();
    if (alt) return "the image: " + alt.slice(0, 80);
    return "the image here";
  }
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const ph = (el.getAttribute("placeholder") || "").trim();
    const typ = (el.getAttribute("type") || "field").toLowerCase();
    if (ph) return "the " + typ + " field (“" + ph.slice(0, 45) + "”)";
    return "a form field on the page";
  }

  const txt = (elementText || "").trim();
  if (txt.length > 18) {
    const snippet = txt.length > 72 ? txt.slice(0, 69) + "…" : txt;
    return "the passage that starts: “" + snippet + "”";
  }
  if (heading) return "the block under “" + heading.slice(0, 72) + (heading.length > 72 ? "…" : "") + "”";
  return "this spot on the page";
}

function getGuideElementInfo(pointEv, directEl) {
  let el = directEl;
  if (!el && pointEv && pointEv.targetSelector) {
    try {
      el = document.querySelector(pointEv.targetSelector);
    } catch {
      el = null;
    }
  }
  if (!(el instanceof Element) && pointEv) {
    const atPoint = document.elementFromPoint(pointEv.clientX || 0, pointEv.clientY || 0);
    if (atPoint instanceof Element) {
      el = atPoint;
    }
  }
  if (!(el instanceof Element)) {
    return { elementLabel: "", elementText: "", elementRole: "", stepSummary: "" };
  }
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  const role = el.getAttribute("role") || "";
  const aria = el.getAttribute("aria-label") || "";
  const txt = (el.textContent || "").trim().replace(/\s+/g, " ");
  const elementText = txt.slice(0, 120);
  const stepSummary = buildStepSummary(el, elementText);

  let label = aria || "";
  if (!label && tag === "a") label = "link";
  else if (!label && (tag === "button" || tag === "summary")) label = "button";
  else if (!label && tag && !GENERIC_HTML_LABELS.has(tag)) label = tag;
  else if (!label) label = stepSummary ? stepSummary.slice(0, 48) : "";

  return {
    elementLabel: label,
    elementText: elementText,
    elementRole: role || tag || "",
    stepSummary: stepSummary,
  };
}

class GuideCaptureSession {
  constructor() {
    this.guideSteps = [];
    this.lastScrollState = { targetSelector: null, ratioX: 0, ratioY: 0 };
    this.lastPointEv = null;
    this.debounceTimer = null;
    this.capturePromise = Promise.resolve();
    this.onKey = this.onKey.bind(this);
    const self = this;
    this.recorder = new LessonRecorder({
      shouldIgnoreInteraction: function (ev) {
        return isGuidedLessonUiTarget(ev);
      },
      onEvent: function (ev) {
        void chrome.runtime
          .sendMessage({ type: "GUIDED_LESSON_RECORDING_CHUNK", events: [ev] })
          .catch(function () {});
        if (ev.type === "scroll") {
          self.lastScrollState = {
            targetSelector: ev.targetSelector,
            ratioX: ev.ratioX,
            ratioY: ev.ratioY,
          };
        }
        if (ev.type === "point") {
          self.lastPointEv = ev;
          self.scheduleStepFromPoint(ev);
        }
        if (ev.type === "input") {
          self.captureInputStep(ev);
        }
        if (ev.type === "highlight") {
          self.captureHighlightStep(ev);
        }
      },
    });
  }

  onKey(ev) {
    if (!ev.altKey || !ev.shiftKey || ev.code !== "KeyM") return;
    ev.preventDefault();
    ev.stopPropagation();
    if (this.lastPointEv) {
      this.flushStepNow(this.lastPointEv);
    }
  }

  attach() {
    document.addEventListener("keydown", this.onKey, true);
    removeGuideHud();
    guideHudHost = showGuideRecordingHud();
  }

  detach() {
    document.removeEventListener("keydown", this.onKey, true);
    removeGuideHud();
  }

  scheduleStepFromPoint(ev) {
    const self = this;
    clearTimeout(self.debounceTimer);
    self.debounceTimer = setTimeout(function () {
      self.flushStepNow(ev);
    }, 700);
  }

  flushStepNow(pointEv) {
    const self = this;
    clearTimeout(self.debounceTimer);
    self.debounceTimer = null;
    self.capturePromise = self.capturePromise.then(function () {
      return self.captureStepThumbnail(pointEv);
    });
  }

  async captureStepThumbnail(pointEv) {
    const step = {
      t: pointEv.t,
      pageUrl: location.href,
      targetSelector: pointEv.targetSelector,
      clientX: pointEv.clientX,
      clientY: pointEv.clientY,
      docX: pointEv.docX,
      docY: pointEv.docY,
      elRect: pointEv.elRect,
      elementLabel: pointEv.elementLabel,
      elementText: pointEv.elementText,
      elementRole: pointEv.elementRole,
      stepSummary: pointEv.stepSummary,
      zoomScale:
        pointEv.elementRole === "button" || pointEv.elementRole === "a" || pointEv.elementRole === "input" ? 1.16 : 1.08,
      scroll: {
        targetSelector: this.lastScrollState.targetSelector,
        ratioX: this.lastScrollState.ratioX,
        ratioY: this.lastScrollState.ratioY,
      },
      thumbnailDataUrl: "",
    };
    this.guideSteps.push(step);
    void chrome.runtime.sendMessage({ type: "GUIDED_LESSON_GUIDE_STEP", step: step }).catch(function () {});
  }

  captureHighlightStep(highlightEv) {
    if (!highlightEv || !highlightEv.range) return;
    var range = rangeFromAnchored(highlightEv.range);
    var rect = range ? range.getBoundingClientRect() : null;
    var ancestor = range ? range.commonAncestorContainer : null;
    while (ancestor && ancestor.nodeType !== Node.ELEMENT_NODE) {
      ancestor = ancestor.parentNode;
    }
    var sel = ancestor instanceof Element ? elementToCssPath(ancestor) : "";
    var selectedText = range ? (range.toString() || "").trim().replace(/\s+/g, " ") : "";
    var snippet = selectedText.slice(0, 120);
    var summary = snippet.length > 12
      ? "the highlighted passage: \u201C" + (snippet.length > 72 ? snippet.slice(0, 69) + "\u2026" : snippet) + "\u201D"
      : "the highlighted section";
    var cx = rect ? Math.round(rect.left + rect.width / 2) : 0;
    var cy = rect ? Math.round(rect.top + rect.height / 2) : 0;
    var step = {
      t: highlightEv.t,
      pageUrl: location.href,
      targetSelector: sel || "",
      clientX: cx,
      clientY: cy,
      docX: Math.round(cx + window.scrollX),
      docY: Math.round(cy + window.scrollY),
      elRect: rect ? { left: Math.round(rect.left + window.scrollX), top: Math.round(rect.top + window.scrollY), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      highlightRange: highlightEv.range,
      highlightText: snippet,
      elementLabel: "highlight",
      elementText: selectedText.slice(0, 220),
      elementRole: "highlight",
      stepSummary: summary,
      actionKind: "highlight",
      zoomScale: 1.02,
      scroll: {
        targetSelector: this.lastScrollState.targetSelector,
        ratioX: this.lastScrollState.ratioX,
        ratioY: this.lastScrollState.ratioY,
      },
      thumbnailDataUrl: "",
    };
    this.guideSteps.push(step);
    void chrome.runtime.sendMessage({ type: "GUIDED_LESSON_GUIDE_STEP", step: step }).catch(function () {});
  }

  captureInputStep(inputEv) {
    const label = inputEv.fieldLabel ? String(inputEv.fieldLabel).trim() : "";
    const valueSnippet = inputEv.valueSnippet ? String(inputEv.valueSnippet).trim() : "";
    const summary =
      "type in " +
      (label || inputEv.stepSummary || "the input field") +
      (valueSnippet ? ' ("' + valueSnippet.slice(0, 34) + '")' : "");
    const step = {
      t: inputEv.t,
      pageUrl: location.href,
      targetSelector: inputEv.targetSelector || "",
      clientX: 0,
      clientY: 0,
      docX: inputEv.docX || 0,
      docY: inputEv.docY || 0,
      elRect: inputEv.elRect || null,
      elementLabel: label || inputEv.elementLabel,
      elementText: inputEv.elementText,
      elementRole: "input",
      stepSummary: summary,
      actionKind: "input",
      inputValueSnippet: valueSnippet,
      scroll: {
        targetSelector: this.lastScrollState.targetSelector,
        ratioX: this.lastScrollState.ratioX,
        ratioY: this.lastScrollState.ratioY,
      },
      thumbnailDataUrl: "",
    };
    this.guideSteps.push(step);
    void chrome.runtime.sendMessage({ type: "GUIDED_LESSON_GUIDE_STEP", step: step }).catch(function () {});
  }

  start() {
    this.attach();
    this.recorder.start();
  }

  async stop() {
    this.detach();
    if (this.debounceTimer != null && this.lastPointEv) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      const pending = this.lastPointEv;
      this.capturePromise = this.capturePromise.then(function () {
        return this.captureStepThumbnail(pending);
      }.bind(this));
    } else {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    try {
      await this.capturePromise;
    } catch (_e) {}
    const snap = this.recorder.stop();
    return {
      sourceUrl: location.href,
      sourceTitle: document.title,
      events: slimEventsForCompile(snap.events),
      guideSteps: this.guideSteps,
    };
  }

  isRecording() {
    return this.recorder.isRecording();
  }
}

class CompiledGuidePlayer {
  constructor() {
    this.host = null;
    this.guide = null;
    this.stepIndex = 0;
    this.raf = null;
    this.targetGlowCleanup = null;
    this.cleanups = [];
    this.originalGuideUrl = "";
  }

  runCleanups() {
    for (var i = 0; i < this.cleanups.length; i++) {
      try { this.cleanups[i](); } catch (_) {}
    }
    this.cleanups = [];
  }

  stop() {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    if (typeof this.targetGlowCleanup === "function") {
      this.targetGlowCleanup();
      this.targetGlowCleanup = null;
    }
    this.runCleanups();
    this.removeHighlightStyle();
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    this.host = null;
    this.guide = null;
    this.stepIndex = 0;
  }

  injectHighlightStyle() {
    if (this.highlightStyleEl) return;
    var s = document.createElement("style");
    s.setAttribute("data-guided-lesson", "highlight-css");
    s.textContent =
      ".guided-lesson-highlight{background:rgba(255,213,79,0.45)!important;border-radius:2px;box-shadow:0 0 0 2px rgba(255,213,79,0.7);transition:background 0.2s;}";
    document.head.appendChild(s);
    this.highlightStyleEl = s;
  }

  removeHighlightStyle() {
    if (this.highlightStyleEl && this.highlightStyleEl.parentNode) {
      this.highlightStyleEl.parentNode.removeChild(this.highlightStyleEl);
    }
    this.highlightStyleEl = null;
  }

  start(guide, originalUrl) {
    this.stop();
    lessonHubOverlay.stop();
    this.guide = guide;
    this.stepIndex = 0;
    this.originalGuideUrl = originalUrl || location.href;
    if (!guide || !guide.steps || !guide.steps.length) {
      return;
    }
    this.injectHighlightStyle();
    this.render();
    this.goToStep(0);
  }

  render() {
    const host = document.createElement("div");
    host.setAttribute("data-guided-lesson-ui", "1");
    host.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483642;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      .spotlight {
        position: fixed;
        border-radius: 10px;
        background: transparent;
        box-shadow: 0 0 0 6px rgba(230, 126, 34, 0.85), 0 0 0 9999px rgba(9, 9, 11, 0.72);
        pointer-events: none;
        transition: top 0.25s cubic-bezier(.4,0,.2,1), left 0.25s cubic-bezier(.4,0,.2,1),
                    width 0.25s cubic-bezier(.4,0,.2,1), height 0.25s cubic-bezier(.4,0,.2,1),
                    transform 0.2s cubic-bezier(.4,0,.2,1);
        z-index: 1;
        transform: scale(1);
      }
      .spotlight.zoom {
        transform: scale(1.03);
      }
      .panel {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: min(100vw, 340px);
        background: #fbfbfb;
        border-left: 1px solid #e4e4e7;
        pointer-events: auto;
        z-index: 2;
        display: flex;
        flex-direction: column;
        font-family: Inter, system-ui, sans-serif;
        box-shadow: -8px 0 40px rgba(0,0,0,0.08);
        transition: left 0.09s linear, right 0.09s linear;
      }
      .panel.side-left {
        left: 0;
        right: auto;
        border-left: 0;
        border-right: 1px solid #e4e4e7;
        box-shadow: 8px 0 40px rgba(0,0,0,0.08);
      }
      .panel.side-right {
        right: 0;
        left: auto;
        border-left: 1px solid #e4e4e7;
        border-right: 0;
      }
      .panel-head {
        padding: 18px 18px 12px;
        border-bottom: 1px solid #e4e4e7;
        background: #fff;
      }
      .panel-head h2 {
        margin: 0 0 4px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #e67e22;
      }
      .panel-head h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: #18181b;
        letter-spacing: -0.02em;
      }
      .panel-body {
        flex: 1;
        overflow: auto;
        padding: 16px 18px;
      }
      .panel-body p {
        margin: 0 0 12px;
        font-size: 14px;
        line-height: 1.55;
        color: #52525b;
      }
      .thumb {
        width: 100%;
        border-radius: 10px;
        border: 1px solid #e4e4e7;
        margin-bottom: 12px;
        max-height: 160px;
        object-fit: cover;
      }
      .tip {
        font-size: 12px;
        color: #71717a;
        background: #f4f4f5;
        border: 1px solid #e4e4e7;
        border-radius: 8px;
        padding: 10px 12px;
        margin-top: 8px;
      }
      .panel-foot {
        padding: 14px 18px;
        border-top: 1px solid #e4e4e7;
        background: #fff;
        display: flex;
        gap: 8px;
      }
      button {
        flex: 1;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #e4e4e7;
        background: #fff;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        color: #18181b;
        font-family: inherit;
      }
      button.primary {
        background: #18181b;
        color: #fff;
        border-color: #18181b;
      }
      button:hover { opacity: 0.92; }
      .progress {
        font-size: 11px;
        color: #a1a1aa;
        margin-top: 6px;
      }
      .click-dot {
        position: fixed;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        margin-left: -9px;
        margin-top: -9px;
        background: rgba(230, 126, 34, 0.95);
        box-shadow: 0 0 0 0 rgba(230, 126, 34, 0.4);
        pointer-events: none;
        z-index: 3;
        opacity: 0;
        transform: scale(0.6);
      }
      .click-dot.show {
        animation: clickPulse 0.3s ease-out;
      }
      @keyframes clickPulse {
        0% { opacity: 1; transform: scale(0.6); box-shadow: 0 0 0 0 rgba(230, 126, 34, 0.42); }
        45% { opacity: 0.95; transform: scale(1.1); box-shadow: 0 0 0 20px rgba(230, 126, 34, 0.1); }
        100% { opacity: 0; transform: scale(1.25); box-shadow: 0 0 0 30px rgba(230, 126, 34, 0); }
      }
      .target-glow {
        outline: 3px solid rgba(230, 126, 34, 0.9) !important;
        outline-offset: 3px !important;
        border-radius: 4px !important;
        transition: outline 0.2s ease;
      }
    `;

    const spotlight = document.createElement("div");
    spotlight.className = "spotlight zoom";
    const clickDot = document.createElement("div");
    clickDot.className = "click-dot";

    const panel = document.createElement("div");
    panel.className = "panel";
    const head = document.createElement("div");
    head.className = "panel-head";
    const h2 = document.createElement("h2");
    h2.textContent = "Student guide";
    const h3 = document.createElement("h3");
    h3.id = "gw-guide-title";
    const progress = document.createElement("div");
    progress.className = "progress";
    progress.id = "gw-guide-progress";
    head.append(h2, h3, progress);

    const body = document.createElement("div");
    body.className = "panel-body";
    body.id = "gw-guide-body";

    const foot = document.createElement("div");
    foot.className = "panel-foot";
    const btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.textContent = "Back";
    const btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.className = "primary";
    btnNext.textContent = "Next";
    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.textContent = "Exit";
    foot.append(btnPrev, btnNext, btnClose);

    const self = this;
    btnPrev.addEventListener("click", function () {
      self.goToStep(self.stepIndex - 1);
    });
    btnNext.addEventListener("click", function () {
      self.goToStep(self.stepIndex + 1);
    });
    btnClose.addEventListener("click", function () {
      self.stop();
    });

    panel.append(head, body, foot);
    shadow.append(style, spotlight, clickDot, panel);
    document.documentElement.appendChild(host);

    this.host = host;
    this.shadow = shadow;
    this.spotlightEl = spotlight;
    this.titleEl = h3;
    this.progressEl = progress;
    this.bodyEl = body;
    this.panelEl = panel;
    this.btnPrev = btnPrev;
    this.btnNext = btnNext;
    this.clickDotEl = clickDot;
  }

  pulseClickDot(x, y, fallbackRect) {
    const dot = this.clickDotEl;
    if (!dot) return;
    let dx = Number.isFinite(x) ? x : NaN;
    let dy = Number.isFinite(y) ? y : NaN;
    if ((!Number.isFinite(dx) || !Number.isFinite(dy)) && fallbackRect) {
      dx = fallbackRect.left + fallbackRect.width / 2;
      dy = fallbackRect.top + fallbackRect.height / 2;
    }
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    dot.style.left = Math.max(12, Math.min(window.innerWidth - 12, dx)) + "px";
    dot.style.top = Math.max(12, Math.min(window.innerHeight - 12, dy)) + "px";
    dot.classList.remove("show");
    void dot.offsetWidth;
    dot.classList.add("show");
  }

  applyTargetGlow(el) {
    if (!(el instanceof Element)) return;
    if (typeof this.targetGlowCleanup === "function") {
      this.targetGlowCleanup();
      this.targetGlowCleanup = null;
    }
    el.classList.add("target-glow");
    this.targetGlowCleanup = function () {
      el.classList.remove("target-glow");
    };
  }

  findTargetElement(s) {
    var el = null;
    if (s.targetSelector && typeof s.targetSelector === "string") {
      try { el = document.querySelector(s.targetSelector); } catch (_) {}
    }
    if (el instanceof Element) {
      var r = el.getBoundingClientRect();
      
      if (Number.isFinite(s.docX) && Number.isFinite(s.docY)) {
        var elDocX = r.left + r.width / 2 + window.scrollX;
        var elDocY = r.top + r.height / 2 + window.scrollY;
        var dist = Math.sqrt(Math.pow(elDocX - s.docX, 2) + Math.pow(elDocY - s.docY, 2));
        var isInside = s.docX >= (r.left + window.scrollX - 50) && 
                       s.docX <= (r.right + window.scrollX + 50) &&
                       s.docY >= (r.top + window.scrollY - 50) &&
                       s.docY <= (r.bottom + window.scrollY + 50);
        if (!isInside && dist > 400) {
          el = null;
        }
      }
    }
    
    if (el instanceof Element) {
      var r = el.getBoundingClientRect();
      var tooBig = r.width * r.height > window.innerWidth * window.innerHeight * 0.15 ||
                   r.width > window.innerWidth * 0.5 || r.height > window.innerHeight * 0.5;
      if (tooBig && Number.isFinite(s.docX) && Number.isFinite(s.docY)) {
        this.hideOverlayForProbe();
        var vpX = s.docX - window.scrollX;
        var vpY = s.docY - window.scrollY;
        var deeper = document.elementFromPoint(
          Math.max(0, Math.min(window.innerWidth - 1, vpX)),
          Math.max(0, Math.min(window.innerHeight - 1, vpY))
        );
        this.showOverlayAfterProbe();
        if (deeper instanceof Element && deeper !== document.body && deeper !== document.documentElement &&
            el.contains(deeper)) {
          el = deeper;
        }
      }
      return el;
    }
    return null;
  }

  hideOverlayForProbe() {
    if (this.host) this.host.style.display = "none";
  }

  showOverlayAfterProbe() {
    if (this.host) this.host.style.display = "";
  }

  positionSpotlight(rect) {
    var spotlight = this.spotlightEl;
    if (!spotlight || !rect) return;
    var pad = 10;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    spotlight.style.top = Math.max(4, rect.top - pad) + "px";
    spotlight.style.left = Math.max(4, rect.left - pad) + "px";
    spotlight.style.width = Math.min(vw - 8, rect.width + pad * 2) + "px";
    spotlight.style.height = Math.min(vh - 8, rect.height + pad * 2) + "px";
    spotlight.classList.remove("zoom");
    void spotlight.offsetWidth;
    spotlight.classList.add("zoom");
  }

  positionPanel(focalRect) {
    if (!this.panelEl || !focalRect) return;
    var focalCenterX = focalRect.left + focalRect.width / 2;
    var panelWidth = Math.min(340, window.innerWidth);
    var panelOnRight = focalCenterX < window.innerWidth - panelWidth - 20;
    this.panelEl.classList.toggle("side-left", !panelOnRight);
    this.panelEl.classList.toggle("side-right", panelOnRight);
  }

  showCompletionScreen() {
    this.runCleanups();
    if (typeof this.targetGlowCleanup === "function") {
      this.targetGlowCleanup();
      this.targetGlowCleanup = null;
    }
    if (this.spotlightEl) this.spotlightEl.style.display = "none";

    var self = this;
    this.titleEl.textContent = "Guide complete!";
    this.progressEl.textContent = "";
    this.bodyEl.innerHTML = "";

    var msg = document.createElement("p");
    msg.textContent = "Nice work! Enter your ClassLoop email to mark this guide as done.";
    msg.style.cssText = "margin:0 0 14px;font-size:14px;color:#52525b;line-height:1.5;";
    this.bodyEl.appendChild(msg);

    var emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "you@school.edu";
    emailInput.style.cssText = "width:100%;padding:10px 12px;border:1px solid #e4e4e7;border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:10px;box-sizing:border-box;";
    this.bodyEl.appendChild(emailInput);

    var statusEl = document.createElement("p");
    statusEl.style.cssText = "margin:0;font-size:12px;color:#71717a;min-height:18px;";
    this.bodyEl.appendChild(statusEl);

    chrome.storage.local.get("classloopStudentEmail", function (d) {
      if (d && d.classloopStudentEmail) emailInput.value = d.classloopStudentEmail;
    });

    var submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "primary";
    submitBtn.textContent = "Submit";
    submitBtn.style.cssText = "width:100%;margin-top:6px;";

    var skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.textContent = "Skip";
    skipBtn.style.cssText = "width:100%;margin-top:6px;";

    this.bodyEl.appendChild(submitBtn);
    this.bodyEl.appendChild(skipBtn);

    submitBtn.addEventListener("click", function () {
      var email = emailInput.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        statusEl.textContent = "Please enter a valid email.";
        statusEl.style.color = "#dc2626";
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      statusEl.textContent = "";
      chrome.storage.local.set({ classloopStudentEmail: email });
      self.submitCompletion(email, statusEl, function () {
        submitBtn.textContent = "Done!";
        setTimeout(function () { self.stop(); }, 1200);
      }, function (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Retry";
        statusEl.textContent = err || "Failed to submit. Try again.";
        statusEl.style.color = "#dc2626";
      });
    });

    skipBtn.addEventListener("click", function () {
      self.stop();
    });

    this.btnPrev.disabled = true;
    this.btnNext.style.display = "none";
  }

  submitCompletion(email, statusEl, onSuccess, onError) {
    var guideUrl = this.originalGuideUrl || "";
    var payload = { studentEmail: email, guideURL: guideUrl };
    statusEl.textContent = "Sending...";
    statusEl.style.color = "#71717a";
    fetch("https://classloop.xyz/api/markGuideCompleted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (resp) {
      if (resp.ok) {
        statusEl.textContent = "Marked as complete!";
        statusEl.style.color = "#16a34a";
        onSuccess();
      } else {
        resp.text().then(function (t) { onError("Server error: " + (t || resp.status)); })
          .catch(function () { onError("Server error: " + resp.status); });
      }
    }).catch(function (e) {
      onError("Network error: " + (e && e.message ? e.message : String(e)));
    });
  }

  goToStep(i) {
    if (!this.guide || !this.guide.steps) return;
    this.runCleanups();
    var steps = this.guide.steps;
    if (i < 0) i = 0;
    if (i >= steps.length) { this.showCompletionScreen(); return; }
    this.stepIndex = i;
    var s = steps[i];

    if (s && s.pageUrl && /^https?:\/\//i.test(s.pageUrl)) {
      var here = stripHash(location.href);
      var there = stripHash(s.pageUrl);
      var firstRoute = this.guide && Array.isArray(this.guide.routeUrls) && this.guide.routeUrls[0]
        ? stripHash(this.guide.routeUrls[0]) : "";
      var shouldHold = i === 0 && firstRoute && here === firstRoute;
      if (here !== there && !shouldHold) {
        var remaining = Object.assign({}, this.guide, { steps: steps.slice(i) });
        var token = toBase64UrlJson(remaining);
        var sep = s.pageUrl.indexOf("#") >= 0 ? "&" : "#";
        location.href = s.pageUrl + sep + "clguide=" + encodeURIComponent(token);
        return;
      }
    }

    if (typeof this.targetGlowCleanup === "function") {
      this.targetGlowCleanup();
      this.targetGlowCleanup = null;
    }

    var self = this;
    var liveRect = null;
    var targetEl = null;

    if (s.actionKind === "highlight" && s.highlightRange) {
      var hRange = rangeFromAnchored(s.highlightRange);
      if (hRange) {
        var hUndo = applyWrappedHighlight(hRange, "guided-lesson-highlight");
        this.cleanups.push(hUndo);
        var hAncestor = hRange.commonAncestorContainer;
        while (hAncestor && hAncestor.nodeType !== Node.ELEMENT_NODE) hAncestor = hAncestor.parentNode;
        if (hAncestor instanceof Element) {
          hAncestor.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
        }
        var hBounds = hRange.getBoundingClientRect();
        if (hBounds && hBounds.width > 0 && hBounds.height > 0) {
          liveRect = { left: hBounds.left, top: hBounds.top, width: hBounds.width, height: hBounds.height };
        }
      }
    }

    if (!liveRect) {
      if (s.scroll && typeof s.scroll.ratioY === "number") {
        applyScrollTarget({
          targetSelector: s.scroll.targetSelector != null ? s.scroll.targetSelector : null,
          ratioX: s.scroll.ratioX || 0,
          ratioY: s.scroll.ratioY || 0,
        });
      }
      targetEl = this.findTargetElement(s);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
        this.applyTargetGlow(targetEl);
      }
    }

    var updateSpotlight = function () {
      var r = null;

      if (s.actionKind === "highlight" && s.highlightRange) {
        var freshRange = rangeFromAnchored(s.highlightRange);
        if (freshRange) {
          var fb = freshRange.getBoundingClientRect();
          if (fb && fb.width > 0 && fb.height > 0) {
            r = { left: fb.left, top: fb.top, width: fb.width, height: fb.height };
          }
        }
        if (!r) r = liveRect;
      }

      if (!r && targetEl && document.contains(targetEl)) {
        var er = targetEl.getBoundingClientRect();
        if (er.width > 0 && er.height > 0) {
          r = { left: er.left, top: er.top, width: er.width, height: er.height };
        }
      }

      if (!r && s.elRect) {
        r = {
          left: s.elRect.left - window.scrollX,
          top: s.elRect.top - window.scrollY,
          width: s.elRect.width,
          height: s.elRect.height
        };
      }

      if (!r && Number.isFinite(s.docX) && Number.isFinite(s.docY)) {
        var vx = s.docX - window.scrollX;
        var vy = s.docY - window.scrollY;
        r = { left: vx - 60, top: vy - 36, width: 120, height: 72 };
      }

      if (!r) {
        r = { left: window.innerWidth * 0.3, top: window.innerHeight * 0.3, width: 160, height: 100 };
      }

      self.positionSpotlight(r);
      self.positionPanel(r);

      if (targetEl && s.actionKind !== "highlight") {
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        self.pulseClickDot(cx, cy, r);
      }
    };

    setTimeout(function () {
      self.raf = requestAnimationFrame(updateSpotlight);
    }, 20);

    this.titleEl.textContent = s.title || "Step " + (i + 1);
    this.progressEl.textContent = "Step " + (i + 1) + " of " + steps.length;

    this.bodyEl.innerHTML = "";
    if (s.thumbnailDataUrl) {
      var img = document.createElement("img");
      img.className = "thumb";
      img.src = s.thumbnailDataUrl;
      img.alt = "";
      this.bodyEl.appendChild(img);
    }
    var p = document.createElement("p");
    p.textContent = s.studentText || "";
    this.bodyEl.appendChild(p);
    if (s.teacherTip) {
      var tip = document.createElement("div");
      tip.className = "tip";
      tip.textContent = "Teacher tip: " + s.teacherTip;
      this.bodyEl.appendChild(tip);
    }

    this.btnPrev.disabled = i <= 0;
    this.btnNext.textContent = i >= steps.length - 1 ? "Done" : "Next";
  }
}

class LessonHubOverlay {
  constructor() {
    this.host = null;
    this.lesson = null;
    this.historyMsgs = [];
    this.expanded = true;
    this.panelEl = null;
    this.panelInnerEl = null;
    this.expandTabEl = null;
    this.chatLogEl = null;
    this.chatInputEl = null;
    this.btnSendEl = null;
    this.chatStatusEl = null;
    this.resourceListEl = null;
    this.resourcesEmptyEl = null;
    this.previewIframeEl = null;
    this.previewLabelEl = null;
    this.previewBlockedEl = null;
    this._previewLoadTimer = null;
    this._pageInsetSave = null;
    this.onFormSubmit = this.onFormSubmit.bind(this);
    this.onWinResize = this.onWinResize.bind(this);
  }

  isCompactLayout() {
    return typeof window !== "undefined" && window.innerWidth <= 560;
  }

  getRailWidthExpanded() {
    return Math.min(380, Math.max(300, Math.round(window.innerWidth * 0.32)));
  }

  getRailWidthCollapsed() {
    return 52;
  }

  syncPageInset() {
    if (!this.host) return;
    const w = this.expanded ? this.getRailWidthExpanded() : this.getRailWidthCollapsed();
    const root = document.documentElement;
    const body = document.body;
    if (!this._pageInsetSave) {
      this._pageInsetSave = {
        htmlMr: root.style.marginRight,
        htmlTr: root.style.transition,
        bodyPb: body.style.paddingBottom,
        bodyTr: body.style.transition,
      };
    }
    const tr =
      "margin-right 0.38s cubic-bezier(0.25, 0.8, 0.25, 1), padding-bottom 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)";
    root.style.transition = tr;
    body.style.transition = tr;
    if (this.isCompactLayout()) {
      root.style.marginRight = "";
      const padExp = Math.round(Math.min(window.innerHeight * 0.88, 580));
      body.style.paddingBottom = (this.expanded ? padExp : 56) + "px";
    } else {
      body.style.paddingBottom = "";
      root.style.marginRight = w + "px";
    }
  }

  clearPageInset() {
    const root = document.documentElement;
    const body = document.body;
    if (this._pageInsetSave) {
      root.style.marginRight = this._pageInsetSave.htmlMr;
      root.style.transition = this._pageInsetSave.htmlTr;
      body.style.paddingBottom = this._pageInsetSave.bodyPb;
      body.style.transition = this._pageInsetSave.bodyTr;
      this._pageInsetSave = null;
    } else {
      root.style.marginRight = "";
      root.style.transition = "";
      body.style.paddingBottom = "";
      body.style.transition = "";
    }
  }

  onWinResize() {
    if (!this.host || !this.panelEl) return;
    if (this.isCompactLayout()) {
      this.panelEl.style.width = "";
      if (!this.expanded) {
        this.panelEl.style.height = "56px";
        this.panelEl.style.maxHeight = "56px";
      }
    } else {
      this.panelEl.style.height = "";
      this.panelEl.style.maxHeight = "";
      const w = this.expanded ? this.getRailWidthExpanded() : this.getRailWidthCollapsed();
      this.panelEl.style.width = w + "px";
    }
    this.syncPageInset();
  }

  setRailCollapsed(collapsed) {
    this.expanded = !collapsed;
    if (!this.panelEl || !this.panelInnerEl || !this.expandTabEl) return;
    if (this.isCompactLayout()) {
      this.panelEl.style.width = "";
      if (collapsed) {
        this.panelEl.style.height = "56px";
        this.panelEl.style.maxHeight = "56px";
      } else {
        this.panelEl.style.height = "";
        this.panelEl.style.maxHeight = "";
      }
    } else {
      this.panelEl.style.height = "";
      this.panelEl.style.maxHeight = "";
      const w = this.expanded ? this.getRailWidthExpanded() : this.getRailWidthCollapsed();
      this.panelEl.style.width = w + "px";
    }
    this.panelEl.classList.toggle("collapsed", collapsed);
    this.panelInnerEl.setAttribute("aria-hidden", collapsed ? "true" : "false");
    this.expandTabEl.classList.toggle("hidden", this.expanded);
    this.syncPageInset();
  }

  toggleRailCollapse() {
    this.setRailCollapsed(this.expanded);
  }

  clearPreviewLoadTimer() {
    if (this._previewLoadTimer != null) {
      clearTimeout(this._previewLoadTimer);
      this._previewLoadTimer = null;
    }
  }

  openResourcePreview(url, title) {
    if (!this.previewIframeEl || !this.previewLabelEl || !this.previewBlockedEl) return;
    this.clearPreviewLoadTimer();
    this.previewBlockedEl.classList.add("hidden");
    this.previewIframeEl.classList.remove("hidden");
    this.previewLabelEl.textContent = title ? "Showing: " + title : "Loading preview…";
    const self = this;
    this._previewLoadTimer = setTimeout(function () {
      self._previewLoadTimer = null;
      if (self.previewBlockedEl && self.previewLabelEl) {
        self.previewBlockedEl.classList.remove("hidden");
        self.previewBlockedEl.textContent =
          "Some sites block embedding. You’re still on the same tab — try another resource or scroll the preview.";
      }
    }, 7000);
    const iframe = this.previewIframeEl;
    iframe.onload = function () {
      self.clearPreviewLoadTimer();
      if (self.previewBlockedEl) self.previewBlockedEl.classList.add("hidden");
    };
    iframe.src = url;
  }

  clearResourcePreview() {
    this.clearPreviewLoadTimer();
    if (this.previewIframeEl) {
      try {
        this.previewIframeEl.onload = null;
        this.previewIframeEl.src = "about:blank";
      } catch {}
      this.previewIframeEl.classList.add("hidden");
    }
    if (this.previewLabelEl) {
      this.previewLabelEl.textContent = "Pick a resource — it opens here (same tab, no new window).";
    }
    if (this.previewBlockedEl) this.previewBlockedEl.classList.add("hidden");
  }

  stop() {
    window.removeEventListener("resize", this.onWinResize);
    this.clearPreviewLoadTimer();
    this.clearPageInset();
    if (this.previewIframeEl) {
      try {
        this.previewIframeEl.src = "about:blank";
      } catch {}
    }
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    this.host = null;
    this.lesson = null;
    this.historyMsgs = [];
    this.expanded = true;
    this.panelEl = null;
    this.panelInnerEl = null;
    this.expandTabEl = null;
    this.chatLogEl = null;
    this.chatInputEl = null;
    this.btnSendEl = null;
    this.chatStatusEl = null;
    this.resourceListEl = null;
    this.resourcesEmptyEl = null;
    this.previewIframeEl = null;
    this.previewLabelEl = null;
    this.previewBlockedEl = null;
  }

  start(lesson) {
    this.stop();
    if (!lesson || typeof lesson !== "object") return;
    this.lesson = lesson;
    compiledGuidePlayer.stop();
    playback.stop();
    this.renderChrome();
    this.renderResources();
    this.historyMsgs = [{ role: "system", content: buildLessonHubSystemPrompt(lesson) }];
    window.addEventListener("resize", this.onWinResize);
    this.syncPageInset();
  }

  renderChrome() {
    const host = document.createElement("div");
    host.setAttribute("data-guided-lesson-ui", "1");
    host.style.cssText = "all:initial;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; }
      .shell {
        position: fixed;
        inset: 0;
        z-index: 2147483641;
        pointer-events: none;
        font-family: Inter, system-ui, -apple-system, sans-serif;
      }
      .panel {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 420px;
        max-width: 100%;
        background: #fbfbfb;
        border-left: 1px solid #e4e4e7;
        box-shadow: -12px 0 48px rgba(0,0,0,0.14);
        pointer-events: auto;
        display: flex;
        flex-direction: row;
        overflow: hidden;
        transition: width 0.38s cubic-bezier(0.25, 0.8, 0.25, 1);
      }
      .panel.collapsed {
        box-shadow: -4px 0 20px rgba(0,0,0,0.08);
      }
      .expand-tab {
        flex-shrink: 0;
        width: 52px;
        border: 0;
        border-right: 1px solid #e4e4e7;
        background: linear-gradient(180deg, #fff 0%, #fafafa 100%);
        cursor: pointer;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 12px 4px;
        font-family: inherit;
        color: #18181b;
        transition: background 0.2s ease;
      }
      .expand-tab:hover { background: #fff5eb; }
      .expand-tab .chev { font-size: 18px; font-weight: 700; color: #e67e22; line-height: 1; }
      .expand-tab .lbl {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #52525b;
      }
      .panel.collapsed .expand-tab { display: flex; }
      .panel-inner {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 1;
        transition: opacity 0.28s ease;
      }
      .panel.collapsed .panel-inner {
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
        width: 0;
        flex: 0;
      }
      .head {
        flex-shrink: 0;
        padding: 14px 14px 10px;
        border-bottom: 1px solid #e4e4e7;
        background: #fff;
      }
      .head-top {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .head-main { min-width: 0; flex: 1; }
      .head-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex-shrink: 0;
      }
      .eyebrow {
        margin: 0 0 4px;
        font-size: 10px;
        font-weight: 700;
        color: #e67e22;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      h1 {
        margin: 0 0 4px;
        font-size: 1.02rem;
        font-weight: 650;
        color: #18181b;
        letter-spacing: -0.02em;
        line-height: 1.3;
      }
      .ctx {
        margin: 0;
        font-size: 11px;
        color: #71717a;
        line-height: 1.45;
        word-break: break-word;
      }
      .btn-ghost, .btn-close {
        padding: 7px 11px;
        border-radius: 8px;
        border: 1px solid #e4e4e7;
        background: #fff;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        color: #18181b;
        font-family: inherit;
      }
      .btn-ghost:hover, .btn-close:hover { background: #fafafa; }
      .scroll {
        flex: 1;
        overflow: auto;
        padding: 12px 14px 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      h2 {
        margin: 0 0 6px;
        font-size: 11px;
        font-weight: 700;
        color: #52525b;
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }
      .resource-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .resource-btn {
        display: block;
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid #e4e4e7;
        background: #fafafa;
        color: #18181b;
        font-weight: 600;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .resource-btn:hover { border-color: #f2b27a; background: #fff; }
      .resource-btn:focus-visible {
        outline: 2px solid rgba(230, 126, 34, 0.35);
        outline-offset: 1px;
      }
      .resource-btn .sub {
        display: block;
        margin-top: 4px;
        font-size: 10px;
        font-weight: 500;
        color: #71717a;
        word-break: break-all;
      }
      .preview-section {
        border: 1px solid #e4e4e7;
        border-radius: 12px;
        background: #fff;
        padding: 10px;
        overflow: hidden;
      }
      .preview-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .preview-head h2 { margin: 0; }
      .preview-clear {
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 6px;
        border: 1px solid #e4e4e7;
        background: #fafafa;
        cursor: pointer;
        font-family: inherit;
        font-weight: 600;
        color: #52525b;
      }
      .preview-frame-wrap {
        position: relative;
        width: 100%;
        height: min(220px, 32vh);
        min-height: 160px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #e4e4e7;
        background: #f4f4f5;
      }
      .preview-iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }
      .preview-iframe.hidden { display: none; }
      .muted {
        margin: 0;
        font-size: 11px;
        color: #71717a;
        line-height: 1.45;
      }
      .preview-blocked {
        margin: 6px 0 0;
        font-size: 11px;
        color: #a16207;
        line-height: 1.4;
      }
      .chat-log {
        min-height: 120px;
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #e4e4e7;
        border-radius: 10px;
        padding: 10px;
        background: #fafafa;
      }
      .bubble {
        padding: 8px 10px;
        border-radius: 9px;
        margin-bottom: 8px;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .bubble.user {
        background: #18181b;
        color: #fff;
        margin-left: 8px;
      }
      .bubble.assistant {
        background: #fff;
        border: 1px solid #e4e4e7;
        margin-right: 8px;
      }
      .bubble.err {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
      }
      .chat-form {
        display: flex;
        gap: 8px;
        align-items: flex-end;
        margin-top: 8px;
      }
      .chat-form textarea {
        flex: 1;
        min-height: 44px;
        max-height: 100px;
        resize: vertical;
        padding: 9px 10px;
        border: 1px solid #e4e4e7;
        border-radius: 9px;
        font: inherit;
        font-size: 13px;
      }
      .chat-form textarea:focus {
        outline: 2px solid rgba(230, 126, 34, 0.2);
        border-color: #f2b27a;
      }
      .chat-form button {
        padding: 10px 14px;
        border-radius: 9px;
        border: 1px solid #18181b;
        background: #18181b;
        color: #fff;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        flex-shrink: 0;
      }
      .chat-form button:disabled { opacity: 0.45; cursor: not-allowed; }
      .status {
        margin-top: 8px;
        font-size: 11px;
        color: #71717a;
        min-height: 14px;
      }
      .status.err { color: #b91c1c; }
      .hidden { display: none !important; }
      @media (max-width: 560px) {
        .panel {
          left: 0;
          right: 0;
          top: auto;
          bottom: 0;
          width: 100% !important;
          height: min(92vh, 100%);
          max-height: 92vh;
          border-left: 0;
          border-top: 1px solid #e4e4e7;
          border-radius: 14px 14px 0 0;
          box-shadow: 0 -10px 40px rgba(0,0,0,0.12);
          flex-direction: column;
        }
        .expand-tab {
          width: 100%;
          height: 48px;
          flex-direction: row;
          border-right: 0;
          border-bottom: 1px solid #e4e4e7;
        }
        .expand-tab .lbl {
          writing-mode: horizontal-tb;
          transform: none;
        }
        .panel.collapsed .expand-tab { display: flex; }
        .panel.collapsed { height: 56px; max-height: 56px; }
        .panel.collapsed .panel-inner { display: none; }
      }
    `;

    const shell = document.createElement("div");
    shell.className = "shell";
    const panel = document.createElement("div");
    panel.className = "panel";
    const w0 = this.getRailWidthExpanded();
    panel.style.width = w0 + "px";

    const expandTab = document.createElement("button");
    expandTab.type = "button";
    expandTab.className = "expand-tab hidden";
    expandTab.setAttribute("aria-label", "Expand lesson hub");
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = "‹";
    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = "Lesson";
    expandTab.append(chev, lbl);

    const inner = document.createElement("div");
    inner.className = "panel-inner";
    inner.setAttribute("aria-hidden", "false");

    const head = document.createElement("div");
    head.className = "head";
    const headTop = document.createElement("div");
    headTop.className = "head-top";
    const headMain = document.createElement("div");
    headMain.className = "head-main";
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "ClassLoop · Lesson hub";
    const h1 = document.createElement("h1");
    const L = this.lesson;
    h1.textContent = (L && L.title) || "Lesson";
    const ctx = document.createElement("p");
    ctx.className = "ctx";
    if (L && (L.contextUrl || L.contextTitle)) {
      ctx.textContent =
        "Tied to: " +
        (L.contextTitle || "This page") +
        (L.contextUrl ? " · " + L.contextUrl : "");
    } else {
      ctx.textContent = "Resources and AI help for this page.";
    }
    headMain.append(eyebrow, h1, ctx);

    const headActions = document.createElement("div");
    headActions.className = "head-actions";
    const btnCollapse = document.createElement("button");
    btnCollapse.type = "button";
    btnCollapse.className = "btn-ghost";
    btnCollapse.textContent = "Hide ›";
    btnCollapse.setAttribute("aria-expanded", "true");
    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "btn-close";
    btnClose.textContent = "Close";
    headActions.append(btnCollapse, btnClose);

    const self = this;
    function syncCollapseBtn() {
      btnCollapse.setAttribute("aria-expanded", self.expanded ? "true" : "false");
      btnCollapse.textContent = self.expanded ? "Hide ›" : "Show ‹";
    }
    btnCollapse.addEventListener("click", function () {
      self.toggleRailCollapse();
      syncCollapseBtn();
    });

    expandTab.addEventListener("click", function () {
      self.setRailCollapsed(false);
      syncCollapseBtn();
    });

    btnClose.addEventListener("click", function () {
      self.stop();
    });

    headTop.append(headMain, headActions);
    head.appendChild(headTop);

    const scroll = document.createElement("div");
    scroll.className = "scroll";

    const resSection = document.createElement("div");
    resSection.className = "res-section";
    const h2r = document.createElement("h2");
    h2r.textContent = "Resources";
    const resEmpty = document.createElement("p");
    resEmpty.className = "muted";
    resEmpty.textContent = "No links in this lesson.";
    const resList = document.createElement("ul");
    resList.className = "resource-list";
    resSection.append(h2r, resEmpty, resList);

    const previewSection = document.createElement("div");
    previewSection.className = "preview-section";
    const previewHead = document.createElement("div");
    previewHead.className = "preview-head";
    const h2p = document.createElement("h2");
    h2p.textContent = "Preview";
    const btnClearPrev = document.createElement("button");
    btnClearPrev.type = "button";
    btnClearPrev.className = "preview-clear";
    btnClearPrev.textContent = "Clear";
    previewHead.append(h2p, btnClearPrev);
    const previewLabel = document.createElement("p");
    previewLabel.className = "muted";
    previewLabel.textContent = "Pick a resource — it opens here (same tab, no new window).";
    const previewWrap = document.createElement("div");
    previewWrap.className = "preview-frame-wrap";
    const previewIframe = document.createElement("iframe");
    previewIframe.className = "preview-iframe hidden";
    previewIframe.setAttribute("title", "Resource preview");
    previewIframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads",
    );
    previewIframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    previewWrap.appendChild(previewIframe);
    const previewBlocked = document.createElement("p");
    previewBlocked.className = "preview-blocked hidden";
    previewSection.append(previewHead, previewLabel, previewWrap, previewBlocked);
    btnClearPrev.addEventListener("click", function () {
      self.clearResourcePreview();
    });

    const chatSection = document.createElement("div");
    const h2c = document.createElement("h2");
    h2c.textContent = "Lesson assistant";
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent =
      "Uses your teacher’s prompt and these resources. Add a Featherless API key in extension options if needed.";
    const chatLog = document.createElement("div");
    chatLog.className = "chat-log";
    const form = document.createElement("form");
    form.className = "chat-form";
    const ta = document.createElement("textarea");
    ta.rows = 2;
    ta.placeholder = "Ask about this lesson or a resource…";
    ta.setAttribute("aria-label", "Message");
    const btnSend = document.createElement("button");
    btnSend.type = "submit";
    btnSend.textContent = "Send";
    form.append(ta, btnSend);
    const st = document.createElement("p");
    st.className = "status";
    chatSection.append(h2c, hint, chatLog, form, st);

    form.addEventListener("submit", this.onFormSubmit);

    scroll.append(resSection, previewSection, chatSection);
    inner.append(head, scroll);
    panel.append(expandTab, inner);
    shell.appendChild(panel);
    shadow.append(style, shell);
    document.documentElement.appendChild(host);

    this.host = host;
    this.panelEl = panel;
    this.panelInnerEl = inner;
    this.expandTabEl = expandTab;
    this.chatLogEl = chatLog;
    this.chatInputEl = ta;
    this.btnSendEl = btnSend;
    this.chatStatusEl = st;
    this.resourceListEl = resList;
    this.resourcesEmptyEl = resEmpty;
    this.previewIframeEl = previewIframe;
    this.previewLabelEl = previewLabel;
    this.previewBlockedEl = previewBlocked;

    if (this.isCompactLayout()) {
      panel.style.width = "";
    }
  }

  renderResources() {
    const lesson = this.lesson;
    const list = this.resourceListEl;
    const empty = this.resourcesEmptyEl;
    if (!list || !empty || !lesson) return;
    list.innerHTML = "";
    if (!lesson.links || !lesson.links.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    const hub = this;
    lesson.links.forEach(function (item) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "resource-btn";
      const titleEl = document.createElement("span");
      titleEl.textContent = item.title;
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = item.url;
      btn.append(titleEl, sub);
      btn.addEventListener("click", function () {
        hub.openResourcePreview(item.url, item.title);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  appendBubble(role, text) {
    const log = this.chatLogEl;
    if (!log) return;
    const div = document.createElement("div");
    div.className = "bubble " + role;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  setChatStatus(msg, isErr) {
    const el = this.chatStatusEl;
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (isErr ? " err" : "");
  }

  onFormSubmit(ev) {
    ev.preventDefault();
    const input = this.chatInputEl;
    const btn = this.btnSendEl;
    if (!input || !this.lesson) return;
    const text = (input.value || "").trim();
    if (!text) return;

    this.appendBubble("user", text);
    input.value = "";
    this.setChatStatus("Thinking…", false);
    if (btn) btn.disabled = true;

    this.historyMsgs.push({ role: "user", content: text });
    const payload = this.historyMsgs.map(function (m) {
      return { role: m.role, content: m.content };
    });

    const self = this;
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
        if (btn) btn.disabled = false;
        if (!res || !res.ok) {
          self.historyMsgs.pop();
          self.appendBubble(
            "err",
            (res && res.error) || "Could not reach the AI. Check your API key in extension options.",
          );
          self.setChatStatus("", false);
          return;
        }
        const reply = String(res.content || "").trim() || "(Empty reply.)";
        self.historyMsgs.push({ role: "assistant", content: reply });
        self.appendBubble("assistant", reply);
        self.setChatStatus("", false);
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        self.historyMsgs.pop();
        self.appendBubble("err", "Something went wrong. Try again.");
        self.setChatStatus("", false);
      });
  }
}

// --- Wire up ---

let guideSession = null;

const recorder = new LessonRecorder({
  onEvent: function (ev) {
    void chrome.runtime
      .sendMessage({ type: "GUIDED_LESSON_RECORDING_CHUNK", events: [ev] })
      .catch(() => {});
  },
});

const playback = new LessonPlayback();
const compiledGuidePlayer = new CompiledGuidePlayer();
const lessonHubOverlay = new LessonHubOverlay();

function fromBase64UrlJson(b64url) {
  const b64 = String(b64url || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  return JSON.parse(decodeURIComponent(escape(atob(padded))));
}

function toBase64UrlJson(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function stripHash(url) {
  return String(url || "").replace(/#.*$/, "");
}

function extractGuideFromHash() {
  const raw = location.hash ? location.hash.slice(1) : "";
  if (!raw) return null;
  const m = raw.match(/(?:^|[&?])clguide=([^&]+)/);
  if (!m || !m[1]) return null;
  try {
    const encoded = decodeURIComponent(m[1]);
    const parsed = fromBase64UrlJson(encoded);
    if (!parsed || !Array.isArray(parsed.steps) || !parsed.steps.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearClGuideHashParam() {
  const raw = location.hash ? location.hash.slice(1) : "";
  if (!raw) return;
  const next = raw
    .split("&")
    .filter(function (p) {
      return p && !/^clguide=/.test(p);
    })
    .join("&");
  const url = location.pathname + location.search + (next ? "#" + next : "");
  history.replaceState(null, "", url);
}

function extractLessonTokenFromHash() {
  const raw = location.hash ? location.hash.slice(1) : "";
  const m = raw.match(/(?:^|[&?])cllesson=([^&]+)/);
  if (!m || !m[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function normalizeSharedLesson(raw) {
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

function parseSharedLessonFromToken(token) {
  try {
    const parsed = fromBase64UrlJson(token);
    if (!parsed || typeof parsed !== "object") return null;
    const ver = Number(parsed.version != null ? parsed.version : parsed.v);
    if (ver !== 3) return null;
    return normalizeSharedLesson(parsed);
  } catch {
    return null;
  }
}

function buildLessonHubSystemPrompt(lesson) {
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

function clearClLessonHashParam() {
  const raw = location.hash ? location.hash.slice(1) : "";
  if (!raw) return;
  const next = raw
    .split("&")
    .filter(function (p) {
      return p && !/^cllesson=/.test(p);
    })
    .join("&");
  const url = location.pathname + location.search + (next ? "#" + next : "");
  history.replaceState(null, "", url);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return;

  switch (message.type) {
    case GL_START_INTERACTIVE_GUIDE: {
      if (guideSession) {
        sendResponse({ ok: false, error: "Guide capture already running" });
        break;
      }
      lessonHubOverlay.stop();
      compiledGuidePlayer.stop();
      showGuideStudioCountdown(function () {
        guideSession = new GuideCaptureSession();
        guideSession.start();
      });
      sendResponse({ ok: true });
      break;
    }
    case GL_STOP_INTERACTIVE_GUIDE: {
      void (async function () {
        let payload = null;
        if (guideSession) {
          payload = await guideSession.stop();
          guideSession = null;
        }
        sendResponse({ ok: true, payload: payload });
      })();
      return true;
    }
    case GL_START_COMPILED_GUIDE_PLAYBACK: {
      lessonHubOverlay.stop();
      compiledGuidePlayer.stop();
      playback.stop();
      if (message.guide) {
        compiledGuidePlayer.start(message.guide);
      }
      sendResponse({ ok: true });
      break;
    }
    case GL_STOP_COMPILED_GUIDE_PLAYBACK: {
      compiledGuidePlayer.stop();
      sendResponse({ ok: true });
      break;
    }
    case GL_START_RECORD: {
      if (guideSession) {
        sendResponse({ ok: false, error: "Stop guide capture first" });
        break;
      }
      const recording = recorder.start();
      sendResponse({ ok: true, recording });
      break;
    }
    case GL_STOP_RECORD: {
      const recording = recorder.stop();
      sendResponse({ ok: true, recording });
      break;
    }
    case GL_START_PLAYBACK: {
      lessonHubOverlay.stop();
      compiledGuidePlayer.stop();
      playback.stop();
      playback.start(message.recording);
      sendResponse({ ok: true });
      break;
    }
    case GL_STOP_PLAYBACK: {
      playback.stop();
      sendResponse({ ok: true });
      break;
    }
    case GL_PING: {
      sendResponse({
        ok: true,
        pong: true,
        pageUrl: location.href,
        pageTitle: document.title,
        time: Date.now(),
      });
      break;
    }
    case GL_GET_STATS: {
      const pb = playback.getPlaybackPosition();
      sendResponse({
        ok: true,
        pageUrl: location.href,
        pageTitle: document.title,
        documentHidden: document.hidden,
        recording: recorder.isRecording(),
        guideCaptureActive: !!(guideSession && guideSession.isRecording()),
        eventsInSession: recorder.getEventCount(),
        playbackActive: pb.playbackActive,
        playbackIndex: pb.index,
        playbackTotal: pb.total,
        compiledGuideActive: !!(compiledGuidePlayer.host && compiledGuidePlayer.guide),
      });
      break;
    }
    case GL_CAPTURE_SOURCE_SNAPSHOT: {
      void (async function () {
        try {
          if (typeof html2canvas === "undefined") {
            sendResponse({ ok: false, error: "html2canvas unavailable" });
            return;
          }
          const canvas = await html2canvas(document.documentElement, {
            scale: 0.22,
            useCORS: true,
            allowTaint: true,
            logging: false,
            foreignObjectRendering: false,
          });
          sendResponse({ ok: true, dataUrl: canvas.toDataURL("image/jpeg", 0.62) });
        } catch (e) {
          sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
        }
      })();
      return true;
    }
    default:
      return;
  }

  return true;
});

void chrome.runtime.sendMessage({ type: "GUIDED_LESSON_PING", from: "content" }).catch(() => {});

void (async function maybeResumeGuideCaptureOnPageLoad() {
  if (guideSession) return;
  try {
    const state = await chrome.runtime.sendMessage({ type: GL_GUIDE_SESSION_GET });
    if (!state || !state.ok || !state.active) return;
    guideSession = new GuideCaptureSession();
    guideSession.start();
  } catch {
    // service worker may be asleep or unavailable; manual start still works
  }
})();

void (function maybeOpenSharedLessonOrGuideFromUrl() {
  const lessonToken = extractLessonTokenFromHash();
  if (lessonToken) {
    const sharedLesson = parseSharedLessonFromToken(lessonToken);
    clearClLessonHashParam();
    if (sharedLesson) {
      compiledGuidePlayer.stop();
      playback.stop();
      lessonHubOverlay.start(sharedLesson);
    }
    return;
  }
  const sharedGuide = extractGuideFromHash();
  if (!sharedGuide) return;
  var guideOriginalUrl = location.href.split("#")[0] + location.hash;
  compiledGuidePlayer.stop();
  playback.stop();
  compiledGuidePlayer.start(sharedGuide, guideOriginalUrl);
  clearClGuideHashParam();
})();

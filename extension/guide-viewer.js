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

function toBase64UrlJson(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getGuideFromHash() {
  const raw = location.hash ? location.hash.slice(1) : "";
  const m = raw.match(/(?:^|[&?])guide=([^&]+)/);
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

function buildLaunchUrl(guide) {
  const firstRoute =
    guide && Array.isArray(guide.routeUrls) && guide.routeUrls[0] ? String(guide.routeUrls[0]).trim() : "";
  const step0 = guide && Array.isArray(guide.steps) && guide.steps[0] ? guide.steps[0] : null;
  const source =
    firstRoute ||
    (step0 && typeof step0.pageUrl === "string" && step0.pageUrl.trim()) ||
    (guide && typeof guide.sourceUrl === "string" && guide.sourceUrl.trim()) ||
    "";
  if (!/^https?:\/\//i.test(source)) return "";
  const encoded = toBase64UrlJson(guide);
  const sep = source.indexOf("#") >= 0 ? "&" : "#";
  return source + sep + "clguide=" + encodeURIComponent(encoded);
}

function setStatus(msg, isError) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = isError ? "status error" : "status";
}

function setUi(guide, launchUrl) {
  $("guideTitle").textContent = guide.title || "Interactive Guide";
  $("guideDesc").textContent =
    "This link opens the original lesson page and launches the guide overlay automatically.";
  const src = guide.sourceUrl || (guide.steps[0] && guide.steps[0].pageUrl) || "(no source URL)";
  const hops = Array.isArray(guide.routeUrls) ? guide.routeUrls.length : 0;
  $("guideMeta").textContent =
    "Steps: " + guide.steps.length + " · Source: " + src + (hops > 1 ? " · Sites: " + hops : "");

  $("btnOpenNow").addEventListener("click", function () {
    if (!launchUrl) {
      setStatus("Missing source URL in this shared guide.", true);
      return;
    }
    location.replace(launchUrl);
  });

  $("btnCopyLaunchUrl").addEventListener("click", async function () {
    if (!launchUrl) {
      setStatus("Missing source URL in this shared guide.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(launchUrl);
      setStatus("Launch URL copied.");
    } catch {
      const shown = window.prompt("Copy this launch URL:", launchUrl);
      if (shown !== null) setStatus("Launch URL ready.");
    }
  });
}

function tryAutoRedirect(launchUrl) {
  let attempts = 0;
  function run() {
    if (!launchUrl) return;
    attempts += 1;
    try {
      location.replace(launchUrl);
    } catch {}
    if (attempts < 4) {
      setTimeout(run, 900 + attempts * 300);
    }
  }
  run();
}

function boot() {
  const guide = getGuideFromHash();
  if (!guide) {
    setStatus("Invalid or missing guide payload in URL.", true);
    $("guideDesc").textContent = "Ask for a fresh guide link from your teacher.";
    $("btnOpenNow").disabled = true;
    $("btnCopyLaunchUrl").disabled = true;
    return;
  }
  const launchUrl = buildLaunchUrl(guide);
  setUi(guide, launchUrl);
  if (!launchUrl) {
    setStatus("Guide loaded, but source URL is missing.", true);
    return;
  }
  setStatus("Redirecting to source page…");
  setTimeout(function () {
    tryAutoRedirect(launchUrl);
  }, 300);
}

boot();

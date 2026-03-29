const STORAGE = {
  apiKey: "featherlessApiKey",
  model: "featherlessModel",
  guideModel: "featherlessGuideModel",
  apiBase: "featherlessApiBase",
  aiDefaultOn: "featherlessAiDefaultOn",
};

const DEFAULT_MODEL = "moonshotai/Kimi-K2.5";
const DEFAULT_GUIDE_MODEL = "Qwen/Qwen2.5-7B-Instruct";
const DEFAULT_API_BASE = "https://api.featherless.ai/v1";

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.local.get([
    STORAGE.apiKey,
    STORAGE.model,
    STORAGE.guideModel,
    STORAGE.apiBase,
    STORAGE.aiDefaultOn,
    "classloopStudentEmail",
  ]);

  document.getElementById("apiKey").value = data[STORAGE.apiKey] || "";
  document.getElementById("model").value = data[STORAGE.model] || DEFAULT_MODEL;
  document.getElementById("guideModel").value = data[STORAGE.guideModel] || DEFAULT_GUIDE_MODEL;
  document.getElementById("apiBase").value = data[STORAGE.apiBase] || DEFAULT_API_BASE;
  document.getElementById("aiDefaultOn").checked = data[STORAGE.aiDefaultOn] !== false;
  document.getElementById("studentEmail").value = data["classloopStudentEmail"] || "";

  const status = document.getElementById("status");

  document.getElementById("save").addEventListener("click", async () => {
    status.textContent = "";
    status.className = "";
    const apiKey = document.getElementById("apiKey").value.trim();
    const model = document.getElementById("model").value.trim() || DEFAULT_MODEL;
    const guideModel = document.getElementById("guideModel").value.trim() || DEFAULT_GUIDE_MODEL;
    let apiBase = document.getElementById("apiBase").value.trim() || DEFAULT_API_BASE;
    apiBase = apiBase.replace(/\/$/, "");
    const aiDefaultOn = document.getElementById("aiDefaultOn").checked;

    if (!/^https?:\/\//i.test(apiBase)) {
      status.textContent = "API base must start with http:// or https://";
      status.className = "err";
      return;
    }

    const studentEmail = document.getElementById("studentEmail").value.trim();

    try {
      await chrome.storage.local.set({
        [STORAGE.apiKey]: apiKey,
        [STORAGE.model]: model,
        [STORAGE.guideModel]: guideModel,
        [STORAGE.apiBase]: apiBase,
        [STORAGE.aiDefaultOn]: aiDefaultOn,
        classloopStudentEmail: studentEmail,
      });
      status.textContent = "Saved.";
      status.className = "ok";
    } catch (e) {
      status.textContent = "Could not save: " + (e && e.message ? e.message : String(e));
      status.className = "err";
    }
  });
});

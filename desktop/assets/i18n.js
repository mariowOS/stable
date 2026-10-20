// mariowOS translations for system apps.
//
// Mark text in HTML with data-i18n="key" (also data-i18n-placeholder / data-i18n-title).
// English stays written in the HTML and is the fallback; other languages live in
// /desktop/assets/locales/<lang>.json as { "key": "translation" }. In scripts, use
// mariowOSI18n.t("key", "English text"). The language is Settings › General › Language
// (default English; "auto" follows the computer's language).
(function () {
  const SUPPORTED = ["en", "it"];
  let dictionary = {};
  let language = "en";

  // English unless the user picked a language; "auto" (opt-in) follows the computer.
  function resolve(preference) {
    if (SUPPORTED.includes(preference)) return preference;
    if (preference !== "auto") return "en";
    const fromSystem = String(navigator.language || "en").slice(0, 2).toLowerCase();
    return SUPPORTED.includes(fromSystem) ? fromSystem : "en";
  }

  const t = (key, fallback) => (dictionary[key] !== undefined ? dictionary[key] : (fallback !== undefined ? fallback : key));

  function translateAttribute(root, attribute, property) {
    root.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
      const sourceKey = `i18nSource${attribute[0].toUpperCase()}${attribute.slice(1)}`;
      if (element.dataset[sourceKey] === undefined) element.dataset[sourceKey] = element.getAttribute(property) || "";
      element.setAttribute(property, t(element.getAttribute(`data-i18n-${attribute}`), element.dataset[sourceKey]));
    });
  }

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(element => {
      if (element.dataset.i18nSource === undefined) element.dataset.i18nSource = element.textContent;
      element.textContent = t(element.dataset.i18n, element.dataset.i18nSource);
    });
    translateAttribute(root, "placeholder", "placeholder");
    translateAttribute(root, "title", "title");
  }

  async function load() {
    let preference = "en";
    try { preference = (await (await fetch("/get-settings")).json()).language || "en"; } catch (e) {}
    language = resolve(preference);
    dictionary = {};
    if (language !== "en") {
      try { dictionary = await (await fetch(`/desktop/assets/locales/${language}.json`)).json(); } catch (e) {}
    }
    document.documentElement.lang = language;
    const run = () => apply(document);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
    return language;
  }

  window.mariowOSI18n = Object.freeze({
    ready: load(),
    t,
    apply,
    SUPPORTED,
    get language() { return language; }
  });
})();

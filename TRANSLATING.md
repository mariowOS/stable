# Translating mariowOS

The system apps can be shown in other languages (Settings › General › Language).
English is written directly in the pages; every other language is one JSON file.
Anything not translated yet simply stays in English, so a partial translation is fine.

## Add a new language

1. Fork this repository and create a branch.
2. Pick the language code: lowercase, e.g. `fr`, `de`, `es`, or `pt-br` for a regional
   variant.
3. Copy `desktop/assets/locales/it.json` to `desktop/assets/locales/<code>.json`
   (e.g. `fr.json`) and translate the **values**, never the keys:

   ```json
   "general.language": "Langue",
   ```

   The English text of each key is in the page that uses it: search the repository for
   `data-i18n="general.language"`.
4. Add your language to `desktop/assets/locales/languages.json`, with its name written in
   that language:

   ```json
   {
     "en": "English",
     "it": "Italiano",
     "fr": "Français"
   }
   ```
5. Check your work (needs only [Node.js](https://nodejs.org)):

   ```sh
   node tools/check-locales.js
   ```

   It shows how many keys are translated and points out mistakes: invalid JSON, a key
   with a typo, an empty translation, a language missing from `languages.json`.
6. Open a pull request. The same check runs automatically on it.

That's all: no code changes are needed. After the next update the language appears in
Settings › General › Language.

## Improve an existing language

Edit `desktop/assets/locales/<code>.json`, run `node tools/check-locales.js` and open a
pull request. Keys reported as "not translated yet" are a good place to start.

## Rules for translations

- Keep the file valid JSON: double quotes, a comma after every line except the last.
- Keep translations short: they are buttons, menu items and titles.
- Don't translate brand and feature names such as mariowOS, Wi-Fi, Bluetooth.
- Use the forms the language's own operating systems use (e.g. formal vs. informal).

## For developers: making text translatable

Mark text in HTML with `data-i18n="area.key"` (or `data-i18n-placeholder` /
`data-i18n-title` for those attributes), keeping the English text in the page, and load
`/desktop/assets/i18n.js`. In scripts, use `mariowOSI18n.t("area.key", "English text")`.
Then add the key to `it.json`; `tools/check-locales.js` will list it as missing in the
other languages. The recovery screen (`kernel-recovery.html`) runs without the system and
keeps its own strings, in English and Italian only.

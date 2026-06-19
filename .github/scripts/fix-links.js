#!/usr/bin/env node
/*
 * fix-links.js — repair unresolved CMS slug placeholders in Ycode-exported HTML.
 *
 * Usage:
 *   node fix-links.js <repo-dir> [--dry-run] [--json] [glob...]
 *
 * Behaviour:
 *   - Scans top-level *.html files (index.html first) for <a> tags whose href
 *     still contains a CMS placeholder ("{...}" or its URL-encoded form "%7B...%7D").
 *   - For each, finds the owning portfolio item via the nearest preceding <h2>
 *     (and records the data-collection-item-id when present), slugifies the title,
 *     and verifies <repo>/<slug>/index.html exists before rewriting the href to
 *     "./<slug>/index.html".
 *   - Never touches anything but the matched placeholder href. Preserves exact
 *     byte formatting elsewhere. Idempotent: a resolved link has no braces, so a
 *     second run changes nothing.
 *
 * Exit codes: 0 = ok (changes may or may not have been made), 1 = error.
 * Prints a human report to stderr and, with --json, a machine summary to stdout.
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const repoDir = positional[0] || ".";
const dryRun = flags.has("--dry-run");
const asJson = flags.has("--json");

const PLACEHOLDER_RE = /\{[a-zA-Z0-9_.\-]+\}|%7B[a-zA-Z0-9_.\-]+%7D/i;
const ANY_TOKEN_RE = /\{[a-zA-Z0-9_.\-]+\}/g;

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", agrave: "à", acirc: "â", ccedil: "ç",
  uuml: "ü", ouml: "ö", auml: "ä", ntilde: "ñ", iexcl: "¡", ndash: "-", mdash: "-",
};

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name.toLowerCase())
        ? NAMED_ENTITIES[name.toLowerCase()]
        : m
    );
}

// One slug from a title using a given ampersand strategy ("and" or "drop").
function slugifyWith(title, ampStrategy) {
  let s = decodeEntities(String(title))
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, ""); // strip combining accents
  s = ampStrategy === "and" ? s.replace(/&/g, " and ") : s.replace(/&/g, " ");
  return s
    .toLowerCase()
    .replace(/['"]/g, "")          // drop quotes/apostrophes (no stray hyphen)
    .replace(/[^a-z0-9\s-]/g, " ") // remaining non-alphanumerics -> space
    .trim()
    .replace(/[\s_-]+/g, "-")      // collapse to single hyphens
    .replace(/^-+|-+$/g, "");
}

// Primary slug (used for reporting the expected path).
function slugify(title) {
  return slugifyWith(title, "and");
}

// Candidate slugs to try against the filesystem, in priority order, deduped.
function slugCandidates(title) {
  const cands = [slugifyWith(title, "and"), slugifyWith(title, "drop")];
  return [...new Set(cands.filter(Boolean))];
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

// Directories at repo root that contain an index.html — the real detail pages.
function detailPageSlugs(dir) {
  const out = new Map(); // normalized -> actualSlug
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".")) continue;
    if (fs.existsSync(path.join(dir, ent.name, "index.html"))) {
      out.set(ent.name.toLowerCase().replace(/[^a-z0-9]/g, ""), ent.name);
    }
  }
  return out;
}

function resolveSlug(title, slugMap, repoDir) {
  const candidates = slugCandidates(title);
  // 1) Exact directory match on any candidate.
  for (const slug of candidates) {
    if (slug && fs.existsSync(path.join(repoDir, slug, "index.html"))) return slug;
  }
  // 2) Confident, unambiguous normalized match against real detail-page dirs.
  for (const slug of candidates) {
    const norm = slug.replace(/[^a-z0-9]/g, "");
    if (slugMap.has(norm)) return slugMap.get(norm);
  }
  return null;
}

function findTitleBefore(html, idx) {
  const before = html.slice(0, idx);
  const h2re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m, last = null;
  while ((m = h2re.exec(before)) !== null) last = m;
  if (last) return stripTags(last[1]);
  // Fallback: nearest preceding heading of any level.
  const hre = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  last = null;
  while ((m = hre.exec(before)) !== null) last = m;
  return last ? stripTags(last[1]) : null;
}

function findCollectionIdBefore(html, idx) {
  const before = html.slice(0, idx);
  const re = /data-collection-item-id\s*=\s*"([^"]*)"/gi;
  let m, last = null;
  while ((m = re.exec(before)) !== null) last = m;
  return last ? last[1] : null;
}

// Normalize POST forms for Netlify Forms (Ycode strips this on every export):
// ensure name/data-netlify/honeypot attrs, a hidden form-name input + honeypot
// field, and a real submit button. Returns splice edits; idempotent.
function fixForms(original, rel, report) {
  const edits = [];
  const formOpenRe = /<form\b[^>]*>/gi;
  let m;
  while ((m = formOpenRe.exec(original)) !== null) {
    const tag = m[0];
    if (!/method\s*=\s*["']?\s*post/i.test(tag)) continue; // only submitting forms
    const formStart = m.index;
    const tagEnd = m.index + tag.length; // index just past the closing '>'
    const closeIdx = original.indexOf("</form>", tagEnd);
    const body = closeIdx < 0 ? original.slice(tagEnd) : original.slice(tagEnd, closeIdx);
    // Only normalize genuine contact forms. A <textarea> excludes password
    // gates, search boxes, and newsletter signups (which have no message field).
    if (!/<textarea\b/i.test(body)) continue;
    const formName = (tag.match(/\bname\s*=\s*"([^"]*)"/i) || [, "contact"])[1] || "contact";
    const did = [];

    // 1. Add any missing form-level attributes, just before the closing '>'.
    const addAttrs = [];
    if (!/\bname\s*=/i.test(tag)) addAttrs.push('name="contact"');
    if (!/\bdata-netlify\s*=/i.test(tag)) addAttrs.push('data-netlify="true"');
    if (!/\bnetlify-honeypot\s*=/i.test(tag)) addAttrs.push('netlify-honeypot="bot-field"');
    if (addAttrs.length) {
      const pos = tagEnd - 1;
      edits.push({ start: pos, end: pos, replacement: " " + addAttrs.join(" ") });
      did.push("attrs");
    }

    // 2. Insert hidden form-name + honeypot right after the open tag, if absent.
    if (!/name="form-name"/i.test(body)) {
      edits.push({
        start: tagEnd,
        end: tagEnd,
        replacement:
          `<input type="hidden" name="form-name" value="${formName}" />` +
          `<p style="display:none"><label>Leave this field empty: <input name="bot-field" /></label></p>`,
      });
      did.push("form-name");
    }

    // 3. Flip the submit button to type="submit" if it is type="button".
    if (closeIdx > 0) {
      const buttons = [...body.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
      let target = buttons.find((b) => /submit/i.test(b[1].replace(/<[^>]+>/g, "")));
      if (!target && buttons.length === 1) target = buttons[0];
      if (target) {
        const btnTag = target[0].match(/<button\b[^>]*>/i)[0];
        const typeMatch = btnTag.match(/type\s*=\s*"button"/i);
        if (typeMatch) {
          const start = tagEnd + target.index + btnTag.search(/type\s*=\s*"button"/i);
          edits.push({ start, end: start + typeMatch[0].length, replacement: typeMatch[0].replace(/"button"/i, '"submit"') });
          did.push("submit-button");
        }
      }
    }

    // 4. Anchor target: if something links to "#contact" but no id="contact"
    //    exists, give the contact form's enclosing <section> that id so the
    //    "Contact Me" nav link scrolls correctly.
    const wantsContact = /href="[^"]*#contact"/i.test(original);
    const hasContactId = /(?<!-)\bid="contact"/i.test(original);
    if (wantsContact && !hasContactId) {
      const secStart = original.lastIndexOf("<section", formStart);
      if (secStart !== -1) {
        const secClose = original.indexOf(">", secStart);
        if (secClose !== -1) {
          edits.push({ start: secClose, end: secClose, replacement: ' id="contact"' });
          did.push("contact-anchor");
        }
      }
    }

    if (did.length) report.form.push({ file: rel, form: formName, changes: did });
  }
  return edits;
}

function processFile(file, repoDir, slugMap, report) {
  const original = fs.readFileSync(file, "utf8");
  const rel = path.relative(repoDir, file);
  // Match each full <a ...> open tag. Ycode sometimes emits a duplicate href
  // attribute on the same anchor, so we patch every placeholder href in the tag.
  const anchorRe = /<a\b[^>]*?>/gis;
  const hrefRe = /\bhref\s*=\s*"([^"]*)"/gi;
  const edits = []; // {start, end, replacement}
  let m;
  while ((m = anchorRe.exec(original)) !== null) {
    const tag = m[0];
    const tagStart = m.index;
    if (!PLACEHOLDER_RE.test(tag)) continue; // no placeholder href in this anchor

    const title = findTitleBefore(original, tagStart);
    const collectionId = findCollectionIdBefore(original, tagStart);
    if (!title) {
      report.other.push({ file: rel, context: tag.slice(0, 120), reason: "placeholder href with no nearby title" });
      continue;
    }
    const resolved = resolveSlug(title, slugMap, repoDir);
    if (!resolved) {
      report.skipped.push({ file: rel, project: title, expected: `./${slugify(title)}/index.html`, collectionId });
      continue;
    }
    const newHref = `./${resolved}/index.html`;

    // Patch every href in this tag whose value still holds a placeholder.
    let h, patched = 0;
    hrefRe.lastIndex = 0;
    while ((h = hrefRe.exec(tag)) !== null) {
      const val = h[1];
      if (!PLACEHOLDER_RE.test(val) || val === newHref) continue;
      const valStart = tagStart + h.index + h[0].indexOf('"') + 1;
      edits.push({ start: valStart, end: valStart + val.length, replacement: newHref });
      patched++;
    }
    if (patched > 0) report.fixed.push({ file: rel, project: title, path: newHref, collectionId, hrefs: patched });
  }

  // Report any remaining curly tokens that are NOT slug placeholders we handle.
  let t;
  while ((t = ANY_TOKEN_RE.exec(original)) !== null) {
    const token = t[0];
    if (/^\{slug\}$/i.test(token)) continue;
    const ctxStart = Math.max(0, t.index - 40);
    report.other.push({
      file: path.relative(repoDir, file),
      token,
      context: original.slice(ctxStart, t.index + token.length + 20).replace(/\s+/g, " "),
    });
  }

  if (!flags.has("--links-only")) {
    for (const e of fixForms(original, rel, report)) edits.push(e);
  }

  if (edits.length === 0) return;
  edits.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const e of edits) {
    out += original.slice(cursor, e.start) + e.replacement;
    cursor = e.end;
  }
  out += original.slice(cursor);
  if (!dryRun) fs.writeFileSync(file, out, "utf8");
}

function targetFiles(repoDir, globs) {
  if (globs.length) return globs.map((g) => path.resolve(repoDir, g));
  const all = fs
    .readdirSync(repoDir)
    .filter((f) => f.toLowerCase().endsWith(".html"))
    .map((f) => path.join(repoDir, f));
  all.sort((a, b) => (path.basename(a) === "index.html" ? -1 : 0) - (path.basename(b) === "index.html" ? -1 : 0));
  return all;
}

function main() {
  const repo = path.resolve(repoDir);
  if (!fs.existsSync(repo)) {
    console.error(`Repo dir not found: ${repo}`);
    process.exit(1);
  }
  const slugMap = detailPageSlugs(repo);
  const report = { fixed: [], skipped: [], other: [], form: [] };
  const files = targetFiles(repo, positional.slice(1));
  for (const f of files) {
    if (fs.existsSync(f)) processFile(f, repo, slugMap, report);
  }

  const lines = [];
  lines.push(dryRun ? "=== DRY RUN (no files written) ===" : "=== APPLIED ===");
  lines.push(`Fixed (${report.fixed.length}):`);
  report.fixed.forEach((r) => lines.push(`  ✓ ${r.project} -> ${r.path}  [${r.file}]`));
  lines.push(`Skipped, destination page missing (${report.skipped.length}):`);
  report.skipped.forEach((r) => lines.push(`  ✗ ${r.project} -> expected ${r.expected}  [${r.file}]`));
  lines.push(`Other unresolved template syntax (${report.other.length}):`);
  report.other.forEach((r) =>
    lines.push(`  ? ${r.token || r.context}  [${r.file}]${r.reason ? " — " + r.reason : ""}`)
  );
  lines.push(`Form normalization (${report.form.length}):`);
  report.form.forEach((r) => lines.push(`  ⚙ form "${r.form}": ${r.changes.join(", ")}  [${r.file}]`));
  console.error(lines.join("\n"));

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2));
  }
  // Signal "changes made" via a sentinel the workflow can grep.
  if (report.fixed.length > 0 || report.form.length > 0) console.error("\nCHANGES_MADE=1");
}

main();

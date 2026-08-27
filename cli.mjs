#!/usr/bin/env node
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";

function detectEncoding(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: "UTF-8 BOM", offset: 3, supported: true };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "UTF-16 LE", offset: 2, supported: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "UTF-16 BE", offset: 2, supported: false };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { encoding: "UTF-8 (no BOM)", offset: 0, supported: true };
  } catch {
    return { encoding: "Unknown / not valid UTF-8", offset: 0, supported: false };
  }
}

function parseCsv(text, delimiter = ",") {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) return { rows, error: "Unclosed quoted field" };
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return { rows, error: null };
}

function guessDelimiter(text) {
  const candidates = [",", "\t", ";", "|"];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).slice(0, 20);
  let best = { delimiter: ",", score: -1 };
  for (const delimiter of candidates) {
    const widths = lines.map(line => parseCsv(line, delimiter).rows[0]?.length ?? 0);
    const common = widths.reduce((map, width) => map.set(width, (map.get(width) || 0) + 1), new Map());
    const [width, frequency] = [...common].sort((left, right) => right[1] - left[1])[0] || [1, 0];
    const score = width > 1 ? frequency * 100 + width : 0;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function analyze(text, delimiter = guessDelimiter(text)) {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""), delimiter);
  const issues = [];
  if (parsed.error) issues.push({ type: "parse", row: null, detail: parsed.error });
  if (!parsed.rows.length) return { rows: [], cleanRows: [], issues: [{ type: "empty", row: null, detail: "No rows found" }] };
  const [headers, ...data] = parsed.rows;
  const seenHeaders = new Map();
  headers.forEach((header, index) => {
    const key = header.trim();
    if (!key) issues.push({ type: "empty_header", row: 1, detail: `Column ${index + 1} has an empty header` });
    if (key && seenHeaders.has(key)) issues.push({ type: "duplicate_header", row: 1, detail: `Header “${key}” is duplicated` });
    seenHeaders.set(key, index);
  });
  const seenRows = new Map();
  data.forEach((row, index) => {
    const number = index + 2;
    if (row.length !== headers.length) issues.push({ type: "column_count", row: number, detail: `Expected ${headers.length} columns, found ${row.length}` });
    const key = JSON.stringify(row);
    if (seenRows.has(key)) issues.push({ type: "duplicate_row", row: number, detail: `Duplicates row ${seenRows.get(key)}` });
    else seenRows.set(key, number);
  });
  const cleanHeaders = headers.map((value, index) => value.trim() || `column_${index + 1}`).map((value, index, all) => {
    const prior = all.slice(0, index).filter(item => item === value).length;
    return prior ? `${value}_${prior + 1}` : value;
  });
  return { rows: parsed.rows, cleanRows: [cleanHeaders, ...data.map(row => [...row])], issues };
}

function serializeCsv(rows, delimiter = ",") {
  return rows.map(row => row.map(value => {
    const text = String(value ?? "");
    return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(delimiter)).join("\r\n") + "\r\n";
}

function defaultPaths(input) {
  const absolute = resolve(input);
  const stem = basename(absolute, extname(absolute)) || "csv-preflight";
  return { output: join(dirname(absolute), `${stem}.normalized.csv`), report: join(dirname(absolute), `${stem}.issues.csv`) };
}

export function parseArgs(argv) {
  const config = { input: "", output: "", report: "" };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--output") {
      const next = argv[++index];
      if (!next || next.startsWith("-")) throw new Error("--output needs a path");
      config.output = next;
    } else if (value === "--report") {
      const next = argv[++index];
      if (!next || next.startsWith("-")) throw new Error("--report needs a path");
      config.report = next;
    }
    else if (value === "--help" || value === "-h") config.help = true;
    else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else if (config.input) throw new Error("The free CLI accepts exactly one input file");
    else config.input = value;
  }
  if (config.help) return config;
  if (!config.input) throw new Error("Choose one CSV input file");
  const defaults = defaultPaths(config.input);
  config.output = resolve(config.output || defaults.output);
  config.report = resolve(config.report || defaults.report);
  const input = resolve(config.input);
  if (new Set([input, config.output, config.report]).size !== 3) throw new Error("Input, normalized output, and report paths must be different");
  return config;
}

export function helpText() {
  return [
    "CSV Preflight free CLI (Node.js 20+)",
    "Usage: node cli.mjs input.csv [--output normalized.csv] [--report issues.csv]",
    "Exit 0: clean; exit 1: issues or rejected input; exit 2: invocation/runtime error.",
    "One generic UTF-8 file per run. Existing outputs are never overwritten.",
  ].join("\n");
}

function reportBytes(issues) {
  const rows = [["type", "row", "detail"], ...issues.map(issue => [issue.type, issue.row ?? "", issue.detail])];
  return new TextEncoder().encode(`\uFEFF${serializeCsv(rows)}`);
}

export function runCli(argv, io = {}) {
  const readFile = io.readFile || (file => new Uint8Array(readFileSync(file)));
  const outputExists = io.outputExists || existsSync;
  const writeFile = io.writeFile || ((file, bytes) => writeFileSync(file, bytes, { flag: "wx" }));
  const stdout = io.stdout || (message => process.stdout.write(`${message}\n`));
  const stderr = io.stderr || (message => process.stderr.write(`${message}\n`));
  try {
    const config = parseArgs(argv);
    if (config.help) { stdout(helpText()); return 0; }
    const bytes = readFile(config.input);
    if (!(bytes instanceof Uint8Array)) throw new TypeError("Input reader must return Uint8Array bytes");
    if (bytes.length > 10 * 1024 * 1024) throw new Error("The free CLI input must be 10 MiB or less");
    const detected = detectEncoding(bytes);
    let issues; let normalized = null;
    if (!detected.supported) {
      issues = [{ type: "encoding", row: null, detail: `${detected.encoding} is not supported; export as UTF-8` }];
    } else {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(detected.offset));
      const result = analyze(text);
      issues = result.issues;
      if (!issues.some(issue => issue.type === "parse" || issue.type === "empty")) {
        normalized = new TextEncoder().encode(`\uFEFF${serializeCsv(result.cleanRows)}`);
      }
    }
    const targets = normalized ? [config.output, config.report] : [config.report];
    const occupied = targets.find(outputExists);
    if (occupied) throw new Error(`Refusing to overwrite existing output: ${occupied}`);
    if (normalized) writeFile(config.output, normalized);
    writeFile(config.report, reportBytes(issues));
    stdout(normalized ? `Normalized: ${config.output}` : "Normalized output withheld because the input was rejected");
    stdout(`Report: ${config.report} (${issues.length} issue(s))`);
    return issues.length ? 1 : 0;
  } catch (error) {
    stderr(`CSV Preflight: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

export function isMain(metaUrl, argvPath, realpath = realpathSync) {
  if (!argvPath) return false;
  try { return realpath(fileURLToPath(metaUrl)) === realpath(argvPath); }
  catch { return false; }
}

if (isMain(import.meta.url, process.argv[1])) {
  process.exitCode = runCli(process.argv.slice(2));
}

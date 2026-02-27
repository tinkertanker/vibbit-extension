export const SHARED_COMPAT_EXPORT_NAMES = [
  "sanitizeMakeCode",
  "normaliseFeedback",
  "resolvePromptTargetContext",
  "buildUserPrompt",
  "parseModelOutput",
  "validateBlocksCompatibility",
  "stubForTarget",
  "extractGeminiText"
];

export function sanitizeMakeCode(input) {
  if (!input) return "";
  let text = String(input);
  if (/^```/.test(text)) text = text.replace(/^```[\s\S]*?\n/, "").replace(/```\s*$/, "");
  text = text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, "\"");
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\u00A0/g, " ");
  text = text.replace(/^`+|`+$/g, "");
  return text.trim();
}

export function normaliseFeedback(items, fallback = "") {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(items) ? items : []) {
    const text = String(item || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(text);
  }
  if (!list.length && fallback) list.push(fallback);
  return list;
}

export function resolvePromptTargetContext(target) {
  if (target === "arcade") {
    return {
      targetName: "Arcade",
      namespaceList: "controller,game,scene,sprites,info,music,effects"
    };
  }
  if (target === "maker") {
    return {
      targetName: "Maker",
      namespaceList: "pins,input,loops,music"
    };
  }
  return {
    targetName: "micro:bit",
    namespaceList: "basic,input,music,led,radio,pins,loops,logic,variables,math,functions,arrays,text,game,images,serial,control"
  };
}

export const DEFAULT_CURRENT_CODE_TRUNCATION_MARKER = "\n// ... CURRENT_CODE_TRUNCATED ...\n";

export function boundCurrentCodeForPrompt(currentCode, {
  maxChars = 0,
  truncationMarker = DEFAULT_CURRENT_CODE_TRUNCATION_MARKER
} = {}) {
  const source = String(currentCode || "");
  if (!source.trim()) {
    return { text: "", truncated: false, omittedChars: 0 };
  }
  if (!maxChars || source.length <= maxChars) {
    return { text: source, truncated: false, omittedChars: 0 };
  }

  const budget = Math.max(0, maxChars - truncationMarker.length);
  const headBudget = Math.floor(budget * 0.65);
  const tailBudget = Math.max(0, budget - headBudget);
  const head = source.slice(0, headBudget).trimEnd();
  const tail = source.slice(source.length - tailBudget).trimStart();
  const omittedChars = Math.max(0, source.length - (head.length + tail.length));

  return {
    text: head + truncationMarker + tail,
    truncated: true,
    omittedChars
  };
}

export function buildUserPrompt({
  request,
  currentCode,
  pageErrors,
  conversionDialog,
  recentChat,
  maxCurrentCodeChars = 0,
  truncationMarker = DEFAULT_CURRENT_CODE_TRUNCATION_MARKER
} = {}) {
  const blocks = [];
  const recentChatTurns = Array.isArray(recentChat) ? recentChat : [];
  if (recentChatTurns.length) {
    const histLines = ["<<<RECENT_CHAT>>>"];
    for (const turn of recentChatTurns) {
      if (turn.role === "user") {
        histLines.push("Last user message: " + String(turn.content || "").trim());
      } else if (turn.role === "assistant") {
        histLines.push("Last assistant notes: " + String(turn.notes || "").trim());
      }
    }
    histLines.push("<<<END_RECENT_CHAT>>>");
    blocks.push(histLines.join("\n"));
  }

  blocks.push("USER_REQUEST:\n" + String(request || "").trim());

  const errors = Array.isArray(pageErrors)
    ? pageErrors.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (errors.length) {
    blocks.push("<<<PAGE_ERRORS>>>\n- " + errors.join("\n- ") + "\n<<<END_PAGE_ERRORS>>>");
  }

  const dialogTitle = conversionDialog && conversionDialog.title ? String(conversionDialog.title).trim() : "";
  const dialogDescription = conversionDialog && conversionDialog.description ? String(conversionDialog.description).trim() : "";
  if (dialogTitle || dialogDescription) {
    const lines = [];
    if (dialogTitle) lines.push("Title: " + dialogTitle);
    if (dialogDescription) lines.push("Message: " + dialogDescription);
    blocks.push("<<<CONVERSION_DIALOG>>>\n" + lines.join("\n") + "\n<<<END_CONVERSION_DIALOG>>>");
  }

  const boundedCurrentCode = boundCurrentCodeForPrompt(currentCode, {
    maxChars: maxCurrentCodeChars,
    truncationMarker
  });
  if (boundedCurrentCode.text) {
    if (boundedCurrentCode.truncated && maxCurrentCodeChars > 0) {
      blocks.push(
        "<<<CURRENT_CODE_NOTE>>>\n"
        + "Current code was truncated for prompt size. Omitted approx "
        + boundedCurrentCode.omittedChars
        + " chars from the middle.\n<<<END_CURRENT_CODE_NOTE>>>"
      );
    }
    blocks.push("<<<CURRENT_CODE>>>\n" + boundedCurrentCode.text + "\n<<<END_CURRENT_CODE>>>");
  }

  return blocks.join("\n\n");
}

function extractJsonObjectCandidates(text) {
  const matches = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        matches.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return matches;
}

function parseJsonObjectsFromText(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  const candidates = [text];
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) candidates.push(fencedMatch[1].trim());
  candidates.push(...extractJsonObjectCandidates(text));
  const parsedObjects = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const source = String(candidate || "").trim();
    if (!source || seen.has(source)) continue;
    seen.add(source);
    try {
      const parsed = JSON.parse(source);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsedObjects.push(parsed);
      }
    } catch (error) {
    }
  }
  return parsedObjects;
}

function isModelOutputObject(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  return Object.prototype.hasOwnProperty.call(parsed, "code");
}

function extractCode(raw) {
  if (!raw) return "";
  const match = String(raw).match(/```[a-z]*\n([\s\S]*?)```/i);
  const code = match ? match[1] : raw;
  return sanitizeMakeCode(code);
}

export function parseModelOutput(raw) {
  const parsedObjects = parseJsonObjectsFromText(raw);
  for (const parsed of parsedObjects) {
    if (!isModelOutputObject(parsed)) continue;
    const rawFeedback = Array.isArray(parsed.feedback)
      ? parsed.feedback
      : (parsed.feedback == null ? [] : [parsed.feedback]);
    return {
      feedback: normaliseFeedback(rawFeedback),
      code: extractCode(parsed.code == null ? "" : String(parsed.code))
    };
  }
  return { feedback: [], code: extractCode(raw) };
}

export function validateBlocksCompatibility(code, target) {
  const rules = [
    { re: /=>/g, why: "arrow functions" },
    { re: /\bclass\s+/g, why: "classes" },
    { re: /\bnew\s+[A-Z_a-z]/g, why: "new constructor" },
    { re: /\bPromise\b|\basync\b|\bawait\b/g, why: "promises/async" },
    { re: /\bimport\s|\bexport\s/g, why: "import/export" },
    { re: /\$\{[^}]+\}/g, why: "template string interpolation" },
    { re: /\.\s*(map|forEach|filter|reduce|find|some|every)\s*\(/g, why: "higher-order array methods" },
    { re: /\bnamespace\b|\bmodule\b/g, why: "namespaces/modules" },
    { re: /\benum\b|\binterface\b|\btype\s+[A-Z_a-z]/g, why: "TS types/enums" },
    { re: /<\s*[A-Z_a-z0-9_,\s]+>/g, why: "generics syntax" },
    { re: /setTimeout\s*\(|setInterval\s*\(/g, why: "timers" },
    { re: /console\./g, why: "console calls" },
    { re: /^\s*\/\//m, why: "line comments" },
    { re: /\/\*[\s\S]*?\*\//g, why: "block comments" },
    { re: /\brandint\s*\(/g, why: "randint()" },
    { re: /(\*=|\/=|%=|\|=|&=|\^=|<<=|>>=|>>>=)/g, why: "unsupported assignment operators" }
  ];
  const bitwiseRules = [
    /<<|>>>|>>/,
    /\^/,
    /(^|[^|])\|([^|=]|$)/m,
    /(^|[^&])&([^&=]|$)/m
  ];
  const eventRegistrationRe = /\b(?:basic\.forever|loops\.forever|input\.on[A-Z_a-z0-9_]*|radio\.on[A-Z_a-z0-9_]*|pins\.on[A-Z_a-z0-9_]*|controller\.[A-Z_a-z0-9_]*\.onEvent|controller\.on[A-Z_a-z0-9_]*|sprites\.on[A-Z_a-z0-9_]*|scene\.on[A-Z_a-z0-9_]*|game\.on[A-Z_a-z0-9_]*|info\.on[A-Z_a-z0-9_]*|control\.inBackground)\s*\(/;

  if ((target === "microbit" || target === "maker") && /sprites\.|controller\.|scene\.|game\.onUpdate/i.test(code)) {
    return { ok: false, violations: ["Arcade APIs in micro:bit/Maker"] };
  }
  if (target === "arcade" && (/led\./i.test(code) || /radio\./i.test(code))) {
    return { ok: false, violations: ["micro:bit APIs in Arcade"] };
  }

  const violations = [];
  const stringStrippedCode = code.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    (match) => " ".repeat(match.length)
  );
  for (const rule of rules) {
    if (rule.re.test(code)) violations.push(rule.why);
  }
  if (/\bnull\b/.test(stringStrippedCode)) violations.push("null");
  if (/\bundefined\b/.test(stringStrippedCode)) violations.push("undefined");
  if (/\bas\s+[A-Z_a-z][A-Z_a-z0-9_.]*/.test(stringStrippedCode)) violations.push("casts");
  if (bitwiseRules.some((rule) => rule.test(code))) violations.push("bitwise operators");
  if (/\bfor\s*\([^)]*\bin\b[^)]*\)/.test(code)) violations.push("for...in loops");

  const forHeaderRe = /for\s*\(([^)]*)\)/g;
  let forMatch;
  while ((forMatch = forHeaderRe.exec(code))) {
    const header = forMatch[1].trim();
    if (/\bof\b/.test(header)) continue;
    const parts = header.split(";").map((part) => part.trim());
    if (parts.length !== 3) {
      violations.push("invalid for-loop shape");
      continue;
    }
    const initMatch = parts[0].match(/^let\s+([A-Z_a-z][A-Z_a-z0-9_]*)\s*=\s*0$/);
    if (!initMatch) {
      violations.push("for-loop initializer must be let i = 0");
      continue;
    }
    const indexVar = initMatch[1];
    if (!new RegExp("^" + indexVar + "\\s*(<|<=)\\s*.+$").test(parts[1])) {
      violations.push("for-loop condition must be i < limit or i <= limit");
    }
    if (!new RegExp("^(?:" + indexVar + "\\+\\+|\\+\\+" + indexVar + ")$").test(parts[2])) {
      violations.push("for-loop increment must be i++");
    }
  }

  const lines = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let depth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const lineDepth = depth;
    if (trimmed) {
      if (lineDepth > 0 && eventRegistrationRe.test(trimmed)) violations.push("nested event registration");
      const fnDecl = trimmed.match(/^function\s+([A-Z_a-z][A-Z_a-z0-9_]*)\s*\(([^)]*)\)/);
      if (fnDecl) {
        if (lineDepth > 0) violations.push("non-top-level function declaration");
        const params = fnDecl[2].trim();
        if (params && (params.includes("?") || params.includes("="))) {
          violations.push("optional/default parameters in function declaration");
        }
      }
      if (/^let\s+[A-Z_a-z][A-Z_a-z0-9_]*(\s*:\s*[^=;]+)?\s*;?$/.test(trimmed)) {
        violations.push("variable declaration without initializer");
      }
    }
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    depth = Math.max(0, depth + opens - closes);
  }

  if (/[^\x09\x0A\x0D\x20-\x7E]/.test(code)) violations.push("non-ASCII characters");
  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}

export function stubForTarget(target) {
  if (target === "arcade") {
    return [
      "controller.A.onEvent(ControllerButtonEvent.Pressed, function () {",
      "    game.splash(\"Start!\")",
      "})",
      "game.onUpdate(function () {",
      "})"
    ].join("\n");
  }
  if (target === "maker") {
    return ["loops.forever(function () {", "})"].join("\n");
  }
  return [
    "basic.onStart(function () {",
    "    basic.showString(\"Hi\")",
    "})"
  ].join("\n");
}

export function extractGeminiText(response) {
  try {
    if (!response) return "";
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.finishReason && String(candidate.finishReason).toUpperCase().includes("BLOCK")) return "";
      const parts = (candidate.content && candidate.content.parts) || [];
      let text = "";
      for (const part of parts) {
        if (part.text) text += part.text;
      }
      return (text || "").trim();
    }
  } catch {
    return "";
  }
  return "";
}

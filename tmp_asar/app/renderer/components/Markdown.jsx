import { useState, useEffect, useRef } from "react";

const LANGUAGE_ALIASES = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "golang",
  sh: "bash",
  yml: "yaml",
  md: "markdown",
  html: "xml",
  cs: "csharp",
  cpp: "cpp",
  c: "c"
};

function highlightCode(code, lang) {
  if (!lang || !code) return code;
  const normalized = LANGUAGE_ALIASES[lang.toLowerCase()] || lang.toLowerCase();
  
  const patterns = {
    comment: /\/\/.*$|#.*$|<!--[\s\S]*?-->/gm,
    string: /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(`(?:[^`\\]|\\.)*`)/g,
    keyword: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|import|export|from|async|await|try|catch|finally|throw|new|this|super|typeof|instanceof|in|of|yield|void|delete|with|debugger|default|enum|implements|interface|package|private|protected|public|static|abstract|final|native|synchronized|transient|volatile|assert|boolean|byte|char|double|float|int|long|short|strictfp)\b/g,
    number: /\b\d+(\.\d+)?\b/g,
    function: /\b([a-zA-Z_$][\w$]*)\s*\(/g,
    operator: /[+\-*/%<>=!&|^~?:]=?/g,
    punctuation: /[{}[\];(),.]/g
  };

  const languagePatterns = {
    python: {
      keyword: /\b(def|class|if|elif|else|for|while|try|except|finally|raise|import|from|as|with|lambda|return|yield|pass|break|continue|and|or|not|in|is|None|True|False|global|nonlocal|async|await|del|assert|match|case)\b/g,
      string: /("""[\s\S]*?""")|('''[\s\S]*?''')|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')/g,
      comment: /#.*$/gm,
      decorator: /@\w+/g
    },
    rust: {
      keyword: /\b(fn|let|mut|if|else|match|loop|for|while|break|continue|return|struct|enum|impl|trait|mod|use|pub|crate|super|self|Self|const|static|async|await|move|ref|Box|Option|Result|Some|None|Ok|Err|Vec|String|HashMap)\b/g,
      string: /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')/g,
      comment: /\/\/.*$|#.*$/gm,
      attribute: /#\[.*?\]/g
    },
    go: {
      keyword: /\b(func|var|const|type|struct|interface|map|chan|go|defer|select|case|default|if|else|for|range|break|continue|return|import|package|fallthrough|goto|select|make|new|append|copy|len|cap|panic|recover|print|println|complex|real|imag)\b/g,
      string: /("(?:[^"\\]|\\.)*")|(`(?:[^`\\]|\\.)*`)/g,
      comment: /\/\/.*$|#.*$/gm
    },
    bash: {
      keyword: /\b(if|then|elif|else|fi|for|while|until|do|done|case|esac|function|return|exit|break|continue|export|local|readonly|declare|source|alias|unalias|set|unset|shift|trap|eval|exec|wait|jobs|fg|bg|disown|kill|umask|ulimit|type|command|builtin|enable|help|let|declare|readonly|export|local)\b/g,
      string: /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')/g,
      comment: /#.*$/gm,
      variable: /\$\{[^}]+\}|\$[a-zA-Z_][a-zA-Z0-9_]*/g
    }
  };

  const langPatterns = languagePatterns[normalized] || patterns;
  
  let result = code
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");

  const tokens = [];
  let lastIndex = 0;

  const allPatterns = Object.entries(langPatterns).map(([type, regex]) => ({
    type,
    regex: new RegExp(regex.source, regex.flags)
  }));

  allPatterns.sort((a, b) => {
    const order = { comment: 0, string: 1, decorator: 2, attribute: 3, keyword: 4, number: 5, function: 6, operator: 7, punctuation: 8, variable: 9 };
    return (order[a.type] || 99) - (order[b.type] || 99);
  });

  while (true) {
    let earliestMatch = null;
    let earliestIndex = result.length;
    let matchedType = null;

    for (const { type, regex } of allPatterns) {
      regex.lastIndex = lastIndex;
      const match = regex.exec(result);
      if (match && match.index < earliestIndex) {
        earliestMatch = match;
        earliestIndex = match.index;
        matchedType = type;
      }
    }

    if (!earliestMatch) break;

    tokens.push({ type: "text", content: result.slice(lastIndex, earliestIndex) });
    tokens.push({ type: matchedType, content: earliestMatch[0] });
    lastIndex = earliestIndex + earliestMatch[0].length;
  }

  if (lastIndex < result.length) {
    tokens.push({ type: "text", content: result.slice(lastIndex) });
  }

  return tokens.map(t => 
    t.type === "text" ? t.content : `<span class="hl-${t.type}">${t.content}</span>`
  ).join("");
}

function renderInline(text, keyPrefix = "t") {
  const nodes = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let match;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      nodes.push(
        <span key={`${keyPrefix}-s${index}`}>{text.slice(last, match.index)}</span>
      );
      index += 1;
    }
    if (match[1]) {
      nodes.push(<code key={`${keyPrefix}-c${index}`} className="md__inline-code">{match[1].slice(1, -1)}</code>);
      index += 1;
    } else if (match[2]) {
      nodes.push(<strong key={`${keyPrefix}-b${index}`}>{match[2].slice(2, -2)}</strong>);
      index += 1;
    } else if (match[3]) {
      nodes.push(<em key={`${keyPrefix}-i${index}`}>{match[3].slice(1, -1)}</em>);
      index += 1;
    } else if (match[4]) {
      nodes.push(
        <a key={`${keyPrefix}-a${index}`} href={match[6]} target="_blank" rel="noreferrer">
          {match[5]}
        </a>
      );
      index += 1;
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) {
    nodes.push(<span key={`${keyPrefix}-end`}>{text.slice(last)}</span>);
  }
  if (nodes.length === 0 && text.length > 0) {
    nodes.push(<span key={`${keyPrefix}-whole`}>{text}</span>);
  }
  return nodes;
}

function CodeBlock({ lang, text }) {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState(null);
  const highlightedRef = useRef(null);

  useEffect(() => {
    if (text) {
      const tokens = highlightCode(text, lang);
      setHighlighted(tokens);
    }
  }, [text, lang]);

  function handleCopy() {
    window.wormgpt.copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="md__code">
      <div className="md__code-header">
        <span className="md__code-lang">{lang || "code"}</span>
        <button type="button" className="ghost md__code-copy" onClick={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code 
          className={`language-${lang || ""}`}
          dangerouslySetInnerHTML={{ __html: highlighted || text }}
        />
      </pre>
    </div>
  );
}

export default function Markdown({ text }) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let paragraph = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];

  function flushParagraph() {
    const joined = paragraph.join("\n").trim();
    if (joined) blocks.push({ type: "p", text: joined });
    paragraph = [];
  }

  function flushCode() {
    if (inCode) {
      blocks.push({ type: "code", lang: codeLang, text: codeLines.join("\n") });
    }
    inCode = false;
    codeLang = "";
    codeLines = [];
  }

  for (const raw of lines) {
    const fence = /^```(\w*)\s*$/.exec(raw.trim());
    if (fence) {
      if (!inCode) {
        flushParagraph();
        inCode = true;
        codeLang = fence[1];
        codeLines = [];
      } else {
        flushCode();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(raw);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(raw);
    if (heading) {
      flushParagraph();
      blocks.push({ type: `h${heading[1].length}`, text: heading[2] });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(raw);
    if (quote) {
      flushParagraph();
      blocks.push({ type: "quote", text: quote[1] });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(raw);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(raw);
    if (bullet || numbered) {
      flushParagraph();
      blocks.push({ type: "li", text: (numbered ? numbered[1] : bullet[1]) });
      continue;
    }

    if (!raw.trim()) {
      flushParagraph();
      continue;
    }

    paragraph.push(raw);
  }
  flushParagraph();
  flushCode();

  const rendered = [];
  let listItems = [];
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0) {
      rendered.push(
        <ul key={`ul-${listKey}`} className="md__list">
          {listItems.map((item, i) => (
            <li key={`li-${i}`}>{renderInline(item, `li${listKey}-${i}`)}</li>
          ))}
        </ul>
      );
      listKey += 1;
      listItems = [];
    }
  }

  blocks.forEach((block, blockIndex) => {
    if (block.type === "li") {
      listItems.push(block.text);
      return;
    }
    flushList();

    const key = `b${blockIndex}`;
    if (block.type === "p") {
      rendered.push(<p key={key}>{renderInline(block.text, key)}</p>);
    } else if (block.type === "code") {
      rendered.push(<CodeBlock key={key} lang={block.lang} text={block.text} />);
    } else if (block.type === "quote") {
      rendered.push(<blockquote key={key}>{renderInline(block.text, key)}</blockquote>);
    } else if (block.type.charAt(0) === "h") {
      const Tag = block.type;
      rendered.push(<Tag key={key}>{renderInline(block.text, key)}</Tag>);
    }
  });
  flushList();

  if (rendered.length === 0) {
    return <div className="md">{renderInline(String(text || ""))}</div>;
  }

  return <div className="md">{rendered}</div>;
}
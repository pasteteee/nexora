import { Fragment, type ReactNode } from "react";

/** A deliberately small, HTML-free Markdown reader. Stored content stays editable source. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|~~[^~\n]+~~)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <del key={i}>{part.slice(2, -2)}</del>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i]);
      blocks.push(<pre key={i}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = ("h" + heading[1].length) as "h1" | "h2" | "h3";
      blocks.push(<Tag key={i}>{inline(heading[2])}</Tag>);
    } else if (/^>\s?/.test(line)) {
      blocks.push(<blockquote key={i}>{inline(line.replace(/^>\s?/, ""))}</blockquote>);
    } else if (/^[-*]\s+\[[ xX]\]\s/.test(line)) {
      const checked = /^[-*]\s+\[[xX]\]/.test(line);
      blocks.push(<div key={i}><span aria-label={checked ? "Выполнено" : "Не выполнено"}>{checked ? "☑" : "☐"}</span> {inline(line.replace(/^[-*]\s+\[[ xX]\]\s/, ""))}</div>);
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push(<div key={i}>• {inline(line.replace(/^[-*]\s+/, ""))}</div>);
    } else if (/^\d+\.\s+/.test(line)) {
      blocks.push(<div key={i}>{inline(line)}</div>);
    } else {
      blocks.push(<Fragment key={i}>{inline(line)}{i < lines.length - 1 && <br />}</Fragment>);
    }
  }
  return <>{blocks}</>;
}

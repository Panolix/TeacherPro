import type { ReactNode } from "react";

/** Decode HTML entities like &rightarrow; to their actual characters. */
function decodeHtmlEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

export function AiMarkdown({ text }: { text: string }) {
  text = decodeHtmlEntities(text);
  // Render inline spans: **bold**, *italic*, `code`
  function renderInline(line: string, baseKey: string): ReactNode[] {
    const tokens: ReactNode[] = [];
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let k = 0;
    while ((match = pattern.exec(line)) !== null) {
      if (match.index > last) tokens.push(line.slice(last, match.index));
      if (match[2] !== undefined)
        tokens.push(<strong key={`${baseKey}-b${k++}`}>{match[2]}</strong>);
      else if (match[3] !== undefined)
        tokens.push(<em key={`${baseKey}-i${k++}`}>{match[3]}</em>);
      else if (match[4] !== undefined)
        tokens.push(
          <code key={`${baseKey}-c${k++}`} className="rounded bg-black/20 px-1 font-mono text-[11px]">
            {match[4]}
          </code>,
        );
      last = match.index + match[0].length;
    }
    if (last < line.length) tokens.push(line.slice(last));
    return tokens;
  }

  // Group lines into block-level nodes
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Blank line — skip, acts as paragraph separator
    if (!trimmed) { i++; continue; }

    // Heading  # / ## / ###
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1
        ? "font-bold text-[14px] mt-2 mb-0.5 text-[var(--tp-text-primary)]"
        : level === 2
          ? "font-semibold text-[13px] mt-1.5 mb-0.5 text-[var(--tp-text-primary)]"
          : "font-semibold text-[12px] mt-1 text-[var(--tp-text-primary)]";
      blocks.push(<div key={i} className={cls}>{renderInline(headingMatch[2], String(i))}</div>);
      i++; continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, "");
        items.push(
          <li key={i} className="ml-4 list-disc">
            {renderInline(itemText, String(i))}
          </li>,
        );
        i++;
      }
      blocks.push(<ul key={`ul-${i}`} className="my-0.5 space-y-0.5">{items}</ul>);
      continue;
    }

    // Numbered list — collect consecutive numbered lines
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push(
          <li key={i} className="ml-4 list-decimal">
            {renderInline(itemText, String(i))}
          </li>,
        );
        i++;
      }
      blocks.push(<ol key={`ol-${i}`} className="my-0.5 space-y-0.5">{items}</ol>);
      continue;
    }

    // Table — detect pipe-delimited rows
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().split("|").slice(1, -1).map((c) => c.trim());
        // Skip separator rows like | :--- | :--- |
        if (!cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")))) {
          rows.push(cells);
        }
        i++;
      }
      if (rows.length > 0) {
        const tableRows: ReactNode[] = [];
        rows.forEach((row, ri) => {
          tableRows.push(
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={`px-2 py-1 text-[12px] border border-[var(--tp-border-strong)] ${ri === 0 ? "font-semibold bg-[var(--tp-panel-muted)]" : ""}`}>
                  {renderInline(cell, `${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          );
        });
        blocks.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-1">
            <table className="w-full border-collapse"><tbody>{tableRows}</tbody></table>
          </div>
        );
      }
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={i} className="leading-relaxed">
        {renderInline(trimmed, String(i))}
      </p>,
    );
    i++;
  }

  return <div className="space-y-1 text-[13px]">{blocks}</div>;
}

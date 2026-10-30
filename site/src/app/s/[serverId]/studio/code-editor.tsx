"use client";
import { useRef } from "react";

/** Plain code editor: line numbers, Tab indents with 4 spaces, monospace. Read-only for generated files. */
export default function CodeEditor({ value, onChange, readOnly }: { value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab" || readOnly || !onChange) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    onChange(value.slice(0, start) + "    " + value.slice(end));
    requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
  }

  return (
    <div className="code">
      <div ref={gutter} className="code-gutter" aria-hidden>
        {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        wrap="off"
      />
    </div>
  );
}

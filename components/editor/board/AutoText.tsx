"use client";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

function fit(n: HTMLTextAreaElement | null) {
  if (!n) return;
  n.style.height = "0px";
  n.style.height = `${n.scrollHeight}px`;
}

/** A textarea that grows with its content: lines of text, cards, cells. Native undo keeps working. */
export const AutoText = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }>(function AutoText(props, outer) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outer, () => ref.current!);
  useLayoutEffect(() => { fit(ref.current); }, [props.value]);
  useLayoutEffect(() => {
    const n = ref.current;
    if (!n) return;
    let width = n.offsetWidth;
    // A narrower widget wraps the text onto more rows: refit when the width changes.
    const ro = new ResizeObserver(() => { if (n.offsetWidth !== width) { width = n.offsetWidth; fit(n); } });
    ro.observe(n);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} rows={1} spellCheck={false} {...props} />;
});

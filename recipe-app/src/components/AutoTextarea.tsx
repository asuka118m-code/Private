import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/** 文字の量に合わせて高さが伸びる入力欄（長い手順も全部見える） */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={2} {...props} style={{ ...props.style, overflow: "hidden", resize: "none" }} />;
}

"use client";

import { useEffect, useState } from "react";

export function TypewriterInsight({ text, speed = 20 }: { text: string; speed?: number }) {
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    setVisibleText("");
    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(interval);
      }
    }, speed);

    return () => window.clearInterval(interval);
  }, [text, speed]);

  return <span>{visibleText}</span>;
}

"use client";

import { useEffect, useState } from "react";

const labels = ["OVERVIEW", "MODES", "MODULES", "BETA"];

export function SpreadIndicator() {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const nodes = labels.map((_, i) => document.getElementById(i === 0 ? "overview" : ["modes", "modules", "beta"][i - 1]));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setCurrent(nodes.indexOf(visible.target as HTMLElement));
    }, { threshold: [0.2, 0.55] });
    nodes.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return <span className="rh-c">SPREAD 0{current + 1} / 04 — {labels[current]}</span>;
}

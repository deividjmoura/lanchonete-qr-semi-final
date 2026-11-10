import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export type ScrollScene = {
  number: string;
  label: string;
  title: string;
  description: string;
  image: string;
  alt: string;
};

export function ScrollStory({
  id,
  eyebrow,
  title,
  description,
  stamp,
  scenes,
  variant = "flow",
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  stamp: string;
  scenes: ScrollScene[];
  variant?: "flow" | "management";
}) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const items = [...node.querySelectorAll<HTMLElement>("[data-story-step]")];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) {
        const index = Number((visible.target as HTMLElement).dataset.storyStep);
        if (Number.isFinite(index)) setActive(index);
      }
    }, { rootMargin: "-28% 0px -48% 0px", threshold: [0, 0.15, 0.35, 0.6] });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [scenes.length]);

  const progress = Math.min(1, (active + 1) / scenes.length);
  const current = scenes[active] ?? scenes[0];

  return (
    <section ref={root} className={`scroll-story scroll-story--${variant}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="page-shell">
        <header className="scroll-story__heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-rule" />{eyebrow}</p>
            <h2 id={`${id}-title`}>{title}</h2>
            <p className="scroll-story__intro">{description}</p>
          </div>
          <p className="scroll-story__stamp">{stamp}</p>
        </header>

        <div className="scroll-story__layout">
          <ol className="scroll-story__steps">
            <svg className="scroll-story__path" viewBox="0 0 44 1000" preserveAspectRatio="none" aria-hidden="true">
              <path className="scroll-story__path-base" d="M22 0 C22 120 10 160 22 250 S34 390 22 500 S10 690 22 780 S22 900 22 1000" pathLength="1" />
              <path className="scroll-story__path-progress" d="M22 0 C22 120 10 160 22 250 S34 390 22 500 S10 690 22 780 S22 900 22 1000" pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1 - progress }} />
            </svg>
            {scenes.map((scene, index) => (
              <li
                className="scroll-story__step"
                data-story-step={index}
                data-active={active === index ? "true" : "false"}
                key={scene.number}
              >
                <span className="scroll-story__marker" aria-hidden="true">
                  <span>{scene.number}</span>
                </span>
                <div className="scroll-story__step-copy">
                  <p className="scroll-story__step-label">{scene.label}</p>
                  <h3>{scene.title}</h3>
                  <p>{scene.description}</p>
                </div>
              </li>
            ))}
          </ol>

          <aside className="scroll-story__stage" aria-label="Demonstração do sistema">
            <div className="scroll-story__stage-head">
              <span><i /> QR ADMIN / {variant === "flow" ? "PEDIDO EM MOVIMENTO" : "VISÃO DA GESTÃO"}</span>
              <span>{current.number} / {String(scenes.length).padStart(2, "0")}</span>
            </div>
            <figure className="scroll-story__screen" aria-live="polite">
              <img key={current.image} src={current.image} alt={current.alt} loading="lazy" decoding="async" />
            </figure>
            <div className="scroll-story__stage-foot">
              <div>
                <span className="scroll-story__stage-label">{current.label}</span>
                <strong>{current.title}</strong>
              </div>
              <span className="scroll-story__stage-arrow"><Icon name="arrow-up-right" size={20} /></span>
            </div>
            <div className="scroll-story__progress" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

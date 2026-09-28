import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import "./generation-loading-card.css";

export const GENERATION_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
] as const;

export type GenerationAspectRatio = (typeof GENERATION_ASPECT_RATIOS)[number];
export type GenerationLoadingStatus = "generating" | "completed" | "failed";

const ASPECT: Record<GenerationAspectRatio, [number, number]> = {
  "1:1": [1, 1],
  "16:9": [16, 9],
  "9:16": [9, 16],
  "4:3": [4, 3],
  "3:4": [3, 4],
  "3:2": [3, 2],
  "2:3": [2, 3],
  "21:9": [21, 9],
};

const PARTICLES = [
  { left: "18%", top: "62%", delay: "0s" },
  { left: "74%", top: "28%", delay: "-4s" },
  { left: "58%", top: "70%", delay: "-8s" },
  { left: "32%", top: "24%", delay: "-2s" },
  { left: "84%", top: "58%", delay: "-11s" },
  { left: "46%", top: "40%", delay: "-6s" },
];

export function generationAspectRatio(value: string): GenerationAspectRatio {
  if ((GENERATION_ASPECT_RATIOS as readonly string[]).includes(value)) {
    return value as GenerationAspectRatio;
  }
  return "1:1";
}

export function GenerationLoadingCard({
  status,
  aspectRatio = "1:1",
  progress,
  imageSrc,
  imageAlt = "生成结果",
  onRetry,
  children,
  subtitle = "正在生成图像",
}: {
  status: GenerationLoadingStatus;
  aspectRatio?: GenerationAspectRatio;
  progress?: number;
  imageSrc?: string;
  imageAlt?: string;
  onRetry?: () => void;
  children?: ReactNode;
  subtitle?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [width, height] = ASPECT[aspectRatio];
  const generating = status === "generating";
  const completed = status === "completed";
  const failed = status === "failed";
  const boundedProgress =
    typeof progress === "number" ? Math.min(100, Math.max(0, progress)) : null;

  return (
    <div className="glc-slot">
      <div
        className="glc"
        data-status={status}
        role="status"
        style={{ ["--glc-w" as string]: width, ["--glc-h" as string]: height }}
      >
        <span className="glc-border" />
        <span className="glc-energy glc-energy-a" />
        <span className="glc-energy glc-energy-b" />
        {completed ? (
          <motion.span
            animate={reduceMotion ? { opacity: 0 } : { opacity: [0, 0.5, 0] }}
            className="glc-flash"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        ) : null}
        {generating || completed ? (
          <motion.div
            animate={{ opacity: completed ? 0 : 1 }}
            className="glc-chrome"
            initial={false}
            transition={{ duration: completed ? 0.4 : 0.2 }}
          >
            <motion.div
              animate={
                completed && !reduceMotion ? { opacity: 0, scale: 1.08 } : { opacity: 1, scale: 1 }
              }
              className="glc-dots-wrap"
              initial={false}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <span className="glc-dots" />
              <span className="glc-dots glc-dots-flicker" />
            </motion.div>
            {PARTICLES.map((particle) => (
              <span
                className="glc-particle"
                key={`${particle.left}-${particle.top}`}
                style={{ left: particle.left, top: particle.top, animationDelay: particle.delay }}
              />
            ))}
            <motion.span
              className="glc-scanner"
              animate={
                reduceMotion
                  ? { x: "40%", opacity: 0.4 }
                  : completed
                    ? { x: ["-20%", "160%"], opacity: [0.35, 0.85, 0] }
                    : { x: ["-35%", "150%"], opacity: [0.15, 0.55, 0.15] }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : completed
                    ? { duration: 0.45, ease: "easeIn" }
                    : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
              }
            />
            <span className="glc-hud">
              <span>Process 01</span>
              <span>Neural render</span>
            </span>
            {generating ? (
              <div className="glc-status">
                <div className="glc-copy">
                  <p className="glc-label">
                    <span>Generating</span>
                    <span aria-hidden className="glc-arrows">
                      {[0, 1, 2, 3, 4].map((index) => (
                        <motion.span
                          animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.2, 0.45, 1, 0.4, 0.2] }}
                          key={index}
                          transition={
                            reduceMotion
                              ? { duration: 0 }
                              : { duration: 1.25, repeat: Infinity, delay: index * 0.12, ease: "easeInOut" }
                          }
                        >
                          ›
                        </motion.span>
                      ))}
                    </span>
                  </p>
                  <p className="glc-sub">{subtitle}</p>
                </div>
                {boundedProgress !== null ? (
                  <span className="glc-percent">{Math.round(boundedProgress)}%</span>
                ) : null}
              </div>
            ) : null}
            {generating && boundedProgress !== null ? (
              <span className="glc-progress">
                <span style={{ width: `${boundedProgress}%` }} />
              </span>
            ) : null}
          </motion.div>
        ) : null}

        {completed ? (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="glc-frame"
            initial={reduceMotion ? false : { opacity: 0, scale: 1.015 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {imageSrc ? <img alt={imageAlt} className="glc-frame" src={imageSrc} /> : children}
          </motion.div>
        ) : null}

        {failed ? (
          <div className="glc-failed">
            <p>Generation failed</p>
            <button className="glc-retry" onClick={onRetry} type="button">
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

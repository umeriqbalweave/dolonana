"use client";

import { useEffect, useState } from "react";

const EMOJI_SETS = [
  ["🪷", "✨", "🌙", "💫", "🕊️", "🤍"],
  ["🌿", "🍃", "🌸", "🪻", "🌺", "🌷"],
  ["☁️", "💜", "🫧", "🦋", "🌈", "💛"],
];

const POSITIONS = [
  { top: "10%", left: "5%" },
  { top: "15%", right: "8%" },
  { top: "30%", left: "3%" },
  { top: "40%", right: "5%" },
  { bottom: "35%", left: "8%" },
  { bottom: "25%", right: "3%" },
  { bottom: "15%", left: "5%" },
  { bottom: "10%", right: "10%" },
];

const ANIMATIONS = ["animate-bounce", "animate-pulse"];
const SIZES = ["text-3xl", "text-4xl", "text-5xl"];

export default function FloatingEmojis({ count = 4 }: { count?: number }) {
  const [emojis, setEmojis] = useState<Array<{
    emoji: string;
    position: typeof POSITIONS[0];
    animation: string;
    size: string;
  }>>([]);

  useEffect(() => {
    // Pick a random emoji set
    const emojiSet = EMOJI_SETS[Math.floor(Math.random() * EMOJI_SETS.length)];
    
    // Shuffle and pick positions
    const shuffledPositions = [...POSITIONS].sort(() => Math.random() - 0.5);
    
    const newEmojis = [];
    for (let i = 0; i < Math.min(count, shuffledPositions.length); i++) {
      newEmojis.push({
        emoji: emojiSet[Math.floor(Math.random() * emojiSet.length)],
        position: shuffledPositions[i],
        animation: ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)],
        size: SIZES[Math.floor(Math.random() * SIZES.length)],
      });
    }
    setEmojis(newEmojis);
  }, [count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {emojis.map((item, index) => (
        <div
          key={index}
          className={`absolute opacity-10 ${item.animation} ${item.size}`}
          style={item.position}
        >
          {item.emoji}
        </div>
      ))}
    </div>
  );
}

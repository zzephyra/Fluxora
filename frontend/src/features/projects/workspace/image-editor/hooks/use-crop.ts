import { useState } from "react";

export function useCrop() {
  const [ratio, setRatio] = useState<number | null>(null);

  function chooseRatio(next: number | null) {
    setRatio(next);
  }

  return { ratio, chooseRatio };
}

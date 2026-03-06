import React, { useEffect, useState } from 'react';

export const CountIn: React.FC<{ start: boolean; onDone?: () => void }> = ({ start, onDone }) => {
  const [counter, setCounter] = useState<number | null>(null);

  useEffect(() => {
    if (!start) return;
    setCounter(3);
    const id = setInterval(() => {
      setCounter((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearInterval(id);
          onDone?.();
          return null;
        }
        return c - 1;
      });
    }, 700);
    return () => clearInterval(id);
  }, [start, onDone]);

  if (counter === null) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-4xl font-black">
      {counter}
    </div>
  );
};

/* Text input that commits on blur / Enter (for values that move the item, e.g. a palette group). */
import { useEffect, useState } from 'react';
import { Combo, Input } from '@/ui';

export function CommitInput({
  value,
  onCommit,
  suggestions,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  suggestions?: string[];
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  bare?: boolean;
  'aria-label'?: string;
  title?: string;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  const props = {
    ...rest,
    value: text,
    onChange: setText,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      commit();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      if (e.key === 'Escape') {
        setText(value);
        setTimeout(() => (e.target as HTMLInputElement).blur());
      }
    },
  };
  return suggestions ? <Combo {...props} suggestions={suggestions} /> : <Input {...props} />;
}

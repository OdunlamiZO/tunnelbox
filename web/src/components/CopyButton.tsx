import { useEffect, useState } from "react";

type Props = {
  value: string;
  label: string;
};

const COPIED_DURATION_MILLISECONDS = 1_500;

async function copyToClipboard(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);

    return;
  }

  // http://tunnelbox is not a secure context, so the Clipboard API is unavailable there.
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

export function CopyButton({ value, label }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(
      () => setCopied(false),
      COPIED_DURATION_MILLISECONDS
    );

    return () => clearTimeout(timer);
  }, [copied]);

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    await copyToClipboard(value);
    setCopied(true);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={copied ? "Copied" : `Copy ${label}`}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
        copied
          ? "text-emerald-400"
          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
      }`}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M3 8.5 6.5 12 13 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <rect
            x="5.5"
            y="5.5"
            width="8"
            height="8"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      )}
    </button>
  );
}

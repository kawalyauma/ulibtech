'use client';

import { useState, useSyncExternalStore } from 'react';
import { Check, Copy, Mail, Send, Share2 } from 'lucide-react';
import type { ShareChannel } from '@edushare/shared';
import { Button, cn } from '@edushare/ui';

function recordShare(resourceId: string, channel: ShareChannel) {
  void fetch(`/api/resources/${resourceId}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel }),
    keepalive: true,
  }).catch(() => undefined);
}

function WhatsAppIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.3-1.4A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1a23 23 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.2h2.8V22h3.4Z" />
    </svg>
  );
}
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
    </svg>
  );
}

export function ShareButtons({
  resourceId,
  url,
  title,
  text,
  className,
}: {
  resourceId: string;
  url: string;
  title: string;
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(
    () => () => undefined,
    () => typeof navigator.share === 'function',
    () => false,
  );
  const message = `${title} – free download: ${url}`;
  const links: {
    channel: ShareChannel;
    label: string;
    href: string;
    icon: React.ReactNode;
    className: string;
  }[] = [
    {
      channel: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(message)}`,
      icon: <WhatsAppIcon className="size-4" />,
      className: 'bg-[#1f8f4e] text-white hover:bg-[#197a42]',
    },
    {
      channel: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      icon: <FacebookIcon className="size-4" />,
      className: 'bg-[#1668d6] text-white hover:bg-[#1259b8]',
    },
    {
      channel: 'x',
      label: 'X',
      href: `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
      icon: <XIcon className="size-4" />,
      className: 'bg-foreground text-background hover:opacity-90',
    },
    {
      channel: 'telegram',
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      icon: <Send className="size-4" aria-hidden="true" />,
      className: 'bg-[#1f7fb8] text-white hover:bg-[#196a9a]',
    },
    {
      channel: 'email',
      label: 'Email',
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
      icon: <Mail className="size-4" aria-hidden="true" />,
      className: 'border bg-card hover:bg-muted',
    },
  ];

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
      recordShare(resourceId, 'native');
    } catch {
      /* cancelled */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    recordShare(resourceId, 'copy');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-sm font-medium">Share with teachers, learners and parents</p>
      <div className="flex flex-wrap gap-2">
        {canShare ? (
          <Button variant="secondary" size="sm" onClick={nativeShare} className="sm:hidden">
            <Share2 className="size-4" aria-hidden="true" /> Share
          </Button>
        ) : null}
        {links.map((l) => (
          <a
            key={l.channel}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={() => recordShare(resourceId, l.channel)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium',
              l.className,
            )}
            data-share={l.channel}
          >
            {l.icon}
            {l.label}
          </a>
        ))}
        <Button variant="outline" size="sm" onClick={copy} aria-live="polite">
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}

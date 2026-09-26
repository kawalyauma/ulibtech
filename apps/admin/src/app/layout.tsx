import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'EduShare Admin', template: '%s · EduShare Admin' },
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-muted/30 min-h-dvh antialiased">{children}</body>
    </html>
  );
}

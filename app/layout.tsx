import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'OpenCourt Display',
  description: 'Reliable, open-source court allocation signage for community tennis clubs.',
  openGraph: {
    title: 'OpenCourt Display',
    description: 'Court allocation signage for community tennis clubs.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenCourt Display',
    description: 'Court allocation signage for community tennis clubs.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

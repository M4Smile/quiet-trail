import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Тихая тропа',
  description: 'Творческое путешествие по тихим историям и случайным встречам.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

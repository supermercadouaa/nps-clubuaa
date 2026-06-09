import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Encuesta de Satisfacción — Club UAA',
  description: 'Contanos tu experiencia de compra en SuperUAA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

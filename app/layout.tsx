import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_URL || 'https://thenimto.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'TheNimto — 360° Virtual Tours for Venues, Dining & Hospitality',
    template: '%s | TheNimto',
  },
  description:
    'Explore immersive 360° virtual tours for restaurants, dining, wedding venues, resorts, and spaces across Nepal with TheNimto.',
  applicationName: 'TheNimto',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/TheNimto.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'TheNimto Virtual Tours',
    locale: 'en_US',
    url: SITE_URL,
    images: [
      {
        url: '/TheNimto.png',
        width: 1200,
        height: 630,
        alt: 'TheNimto Virtual Tours',
      },
    ],
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
        suppressHydrationWarning
      >
        <AuthProvider>
          {children}
        </AuthProvider>
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { StoreProvider } from "@/store/provider";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const vazirmatn = localFont({
  src: "./fonts/Vazirmatn-var.woff2",
  variable: "--font-vazirmatn",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "پشتیبان — پلتفرم هوش مصنوعی پشتیبانی مشتریان",
  description:
    "دانش کسب‌وکارتان را متصل کنید؛ پشتیبان در چند دقیقه یک دستیار هوشمند و ربات تلگرام می‌سازد که به مشتریان شما پاسخ فوری و دقیق می‌دهد.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      suppressHydrationWarning
      // Next 16 no longer overrides `scroll-behavior: smooth` (globals.css)
      // during navigation; this opts back into instant scroll on route change.
      data-scroll-behavior="smooth"
    >
      <body className={`${vazirmatn.variable} font-sans antialiased`}>
        <StoreProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  );
}

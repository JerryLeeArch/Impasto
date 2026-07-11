import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import Providers from "./providers";

const themeCookieName = "impasto-theme";

export const metadata: Metadata = {
  title: "Impasto",
  description: "A private taste log for music and changing opinions.",
};

const themeScript = `
(() => {
  const themeCookieName = "${themeCookieName}";
  const themeMaxAge = 60 * 60 * 24 * 365;

  function getCookieTheme() {
    return document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(themeCookieName + "="))
      ?.split("=")[1];
  }

  function isTheme(value) {
    return value === "dark" || value === "light";
  }

  try {
    const storedTheme = window.localStorage.getItem("impasto-theme");
    const cookieTheme = getCookieTheme();
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = isTheme(storedTheme)
      ? storedTheme
      : isTheme(cookieTheme)
        ? cookieTheme
        : prefersDark
          ? "dark"
          : "light";

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.cookie = themeCookieName + "=" + theme + "; path=/; max-age=" + themeMaxAge + "; SameSite=Lax";
  } catch {
    if (!document.documentElement.dataset.theme) {
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
    }
  }
})();
`;

function toTheme(value: string | undefined) {
  return value === "dark" || value === "light" ? value : "light";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme = toTheme(cookieStore.get(themeCookieName)?.value);

  return (
    <html
      lang="en"
      data-theme={initialTheme}
      style={{ colorScheme: initialTheme }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

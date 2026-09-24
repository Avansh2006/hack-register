"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function Refresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector("form:focus-within")
      )
        router.refresh();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
  return null;
}

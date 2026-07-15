"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CrmApp } from "@/components/crm-app";
import { Icons } from "@/components/ui";
import { getMe, setCachedMe } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void getMe().then((me) => {
      if (!me) {
        router.replace("/sign-in");
        return;
      }
      setCachedMe(me);
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading your workspace…</p>
      </div>
    );
  }

  return <CrmApp />;
}

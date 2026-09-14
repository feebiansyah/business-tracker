"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { candidateZoneText } from "./view-model";

export function CopyCandidatesButton({ zones }: { zones: string[] }) {
  const [copied, setCopied] = useState(false);
  return <Button type="button" variant="ghost" disabled={!zones.length} onClick={async () => {
    await navigator.clipboard.writeText(candidateZoneText(zones)); setCopied(true);
  }}><Copy className="size-4" />{copied ? "Tersalin" : "Copy Zone"}</Button>;
}

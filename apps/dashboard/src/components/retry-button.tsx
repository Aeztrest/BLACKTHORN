"use client";

import { RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button variant="outline" onClick={() => window.location.reload()}>
      <RotateCcwIcon />
      Yeniden dene
    </Button>
  );
}

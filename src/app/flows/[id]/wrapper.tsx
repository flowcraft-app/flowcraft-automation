"use client";

import { use } from "react";
import dynamic from "next/dynamic";

const FlowEditorClient = dynamic(() => import("./FlowEditorClient"), {
  ssr: false,
});

export default function FlowEditorPage({ id }: { id: string }) {
  return <FlowEditorClient flowId={id} />;
}

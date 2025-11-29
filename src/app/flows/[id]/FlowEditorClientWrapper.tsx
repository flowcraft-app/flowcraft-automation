"use client";

import { ReactFlowProvider } from "reactflow";
import FlowEditorClient from "./FlowEditorClient";

export default function FlowEditorClientWrapper({ flowId }: { flowId: string }) {
  return (
    <ReactFlowProvider>
      <FlowEditorClient flowId={flowId} />
    </ReactFlowProvider>
  );
}

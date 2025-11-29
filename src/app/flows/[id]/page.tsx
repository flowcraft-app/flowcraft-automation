import { use } from "react";
import FlowEditorClientWrapper from "./FlowEditorClientWrapper";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return <FlowEditorClientWrapper flowId={id} />;
}

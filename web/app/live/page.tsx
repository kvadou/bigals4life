import LiveLane from "./live-lane";

export default async function LivePage({ searchParams }: { searchParams: Promise<{ night?: string | string[] }> }) {
  const { night } = await searchParams;
  return <LiveLane scorebookId={typeof night === "string" ? night : ""}/>;
}

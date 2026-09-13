import Studio from "./studio";
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ session?: string | string[] }> }) {
  const { session } = await searchParams;
  return <Studio key={typeof session === "string" ? session : ""} initialSessionId={typeof session === "string" ? session : ""}/>;
}

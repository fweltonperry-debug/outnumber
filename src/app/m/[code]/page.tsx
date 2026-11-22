import ExchangeArena from "@/components/ExchangeArena";

export default async function ShareableMatchPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ExchangeArena initialMatchCode={code.toUpperCase()} />;
}

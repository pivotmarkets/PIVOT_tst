"use client";

import { notFound, redirect, useRouter } from "next/navigation";
import MarketDetails from "@/components/MarketDetails";
import { getMarketSummary } from "@/app/view-functions/markets";

interface MarketPageProps {
  params: {
    id: number;
    slug: string;
  };
}

export const dynamicParams = true;

export default async function MarketPage({ params }: MarketPageProps) {
  const { id, slug } = params;
  
  // Fetch the market data
  const market = await getMarketSummary(id);
  
  // If market doesn't exist, show 404
  if (!market) {
    notFound();
  }
  
  // Verify the slug matches (optional SEO check)
  const expectedSlug = market.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();
  
  if (slug !== expectedSlug) {
    redirect(`/market/${id}/${expectedSlug}`);
  }
  
  return <MarketDetails market={market} />;
}
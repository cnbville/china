import { CategoryBrowser } from "@/components/CategoryBrowser";

// Thin server wrapper: unwrap the route params, hand off to the client browser.
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ collection?: string }>;
}) {
  const { id } = await params;
  const { collection } = await searchParams;
  return <CategoryBrowser categoryId={id} initialCollection={collection} />;
}

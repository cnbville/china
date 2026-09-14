import { CollectionCategories } from "@/components/CollectionCategories";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CollectionCategories collectionId={id} />;
}

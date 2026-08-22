import { CollectionTabs } from "./collection-tabs";

const CollectionLayout = async ({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ collectionId: string }>;
}>) => {
  const { collectionId } = await params;
  return (
    <div className="mx-auto max-w-6xl">
      <CollectionTabs collectionId={collectionId} />
      {children}
    </div>
  );
};

export default CollectionLayout;


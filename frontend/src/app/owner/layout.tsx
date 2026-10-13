import OwnerSidebar from "@/components/nav/OwnerSidebar";

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OwnerSidebar>{children}</OwnerSidebar>;
}
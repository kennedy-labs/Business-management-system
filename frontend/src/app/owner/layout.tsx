import OwnerSidebar from "@/components/nav/OwnerSidebar";
import BackendStatus from "@/components/BackendStatus";

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OwnerSidebar>
      <BackendStatus />
      {children}
    </OwnerSidebar>
  );
}
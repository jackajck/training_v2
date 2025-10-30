"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isEmployeeView = pathname?.startsWith("/employee-view");

  if (isEmployeeView) {
    // No sidebar for employee view
    return <>{children}</>;
  }

  // Regular admin layout with sidebar
  return (
    <>
      <Sidebar />
      <main className="ml-64 min-h-screen p-8">{children}</main>
    </>
  );
}

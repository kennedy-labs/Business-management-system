import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// No authentication: the root route goes straight into the app.
export default function Page() {
  redirect("/owner/dashboard");
}

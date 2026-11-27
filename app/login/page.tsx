import { redirect } from "next/navigation";

// old address: sign-in moved to /merchant/login (shops) and /admin/login (platform admin)
export default function OldLoginPage() {
    redirect("/merchant/login");
}

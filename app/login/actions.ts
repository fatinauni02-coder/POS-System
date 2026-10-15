"use server";

import { redirect } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase-server";

export async function signIn(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const supabase = await supabaseAuth();
    const { error } = await supabase.auth.signInWithPassword({ email, password }); // sets the login cookie
    if (error) redirect("/login?error=1");

    redirect("/");
}

export async function signOut() {
    const supabase = await supabaseAuth();
    await supabase.auth.signOut(); // removes the login cookie
    redirect("/login");
}
import { cache } from "react";
import { supabase } from "@/lib/supabase";

// cache(): if the layout AND the page both ask for the shop in one page load,
// Supabase is only asked once.
export const getBusiness = cache(async () => {
  const { data } = await supabase
    .from("businesses")
    .select("id, name, tagline, sst_registered, sst_rate, address, phone, sst_reg_no, receipt_footer, service_mode, auto_print, pin_for, theme, logo_url")
    .eq("slug", "kopi-co")
    .single();
  return data;
});